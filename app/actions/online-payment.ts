"use server"

import { randomBytes } from "node:crypto"
import type { GatewayTransactionStatus, PaymentGatewayEnvironment, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requireActor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import {
  ACTIVE_CHECKOUT_STATUSES,
  decimalNairaToKobo,
  grossUpStandardNigeriaLocalFeeKobo,
  koboToDecimalNaira,
  standardNigeriaLocalFeeKobo,
  validateCheckoutCharges,
} from "@/lib/payments/checkout-rules"
import { platformChargeKobo } from "@/lib/payments/platform-charge"
import { liveCheckoutProblems } from "@/lib/payments/pilot-rules"
import { checkoutEnvironment } from "@/lib/payments/checkout-environment"
import { postVerifiedCheckoutSuccess } from "@/lib/payments/gateway-event-processor.server"
import { PaystackApiError } from "@/lib/payments/paystack.server"
import { adapterForPaymentConfiguration } from "@/lib/payments/payment-settings.server"
import {
  gatewayVerificationIdentityProblems,
  gatewayVerificationProblems,
  type LocalGatewayVerification,
} from "@/lib/payments/verification-rules"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

const selectionSchema = z.object({
  studentId: z.string().uuid(),
  chargeIds: z.array(z.string().uuid()).min(1).max(30),
  allocations: z.array(z.object({
    chargeId: z.string().uuid(),
    amountKobo: z.number().int().positive().safe(),
  })).min(1).max(30).optional(),
}).superRefine((input, context) => {
  if (!input.allocations) return
  const selected = new Set(input.chargeIds)
  const allocated = new Set(input.allocations.map((allocation) => allocation.chargeId))
  if (selected.size !== allocated.size || [...selected].some((chargeId) => !allocated.has(chargeId))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allocations"],
      message: "Each selected fee must have exactly one payment amount",
    })
  }
})

function applicationOrigin(): string {
  const raw = process.env.NEXTAUTH_URL
  if (!raw) throw new Error("Online payment callback URL is not configured")
  const url = new URL(raw)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Online payment callback must use HTTPS")
  }
  return url.origin
}

function reference(): string {
  return `DSP-${Date.now().toString(36)}-${randomBytes(9).toString("hex")}`
}

async function parentCheckoutContext(studentId: string) {
  const actor = await requireActor()
  if (actor.role !== "PARENT") throw new Error("Only a linked parent can start this checkout")

  const parent = await prisma.parent.findUnique({
    where: { userId: actor.userId },
    select: {
      id: true,
      schoolId: true,
      user: {
        select: {
          credentials: {
            where: { type: "EMAIL" },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { value: true },
          },
        },
      },
      students: {
        where: { studentId },
        take: 1,
        select: { student: { select: { id: true, schoolId: true } } },
      },
    },
  })
  const student = parent?.students[0]?.student
  if (!parent || !student || student.schoolId !== parent.schoolId) {
    throw new Error("That student is not linked to your account")
  }
  const payerEmail = parent.user.credentials[0]?.value.trim().toLowerCase()
  if (!payerEmail) throw new Error("Add a unique email to the parent profile before paying online")

  return { actor, schoolId: parent.schoolId, studentId: student.id, payerEmail }
}

async function loadCheckoutInput(
  studentId: string,
  chargeIds: string[],
  requestedAllocations?: Array<{ chargeId: string; amountKobo: number }>,
) {
  const context = await parentCheckoutContext(studentId)
  const environment = checkoutEnvironment()
  const [configuration, charges] = await Promise.all([
    prisma.schoolPaymentConfiguration.findUnique({
      where: {
        schoolId_provider_environment: {
          schoolId: context.schoolId,
          provider: "PAYSTACK",
          environment,
        },
      },
      include: { credential: { select: { id: true } } },
    }),
    prisma.studentCharge.findMany({
      where: { id: { in: chargeIds }, studentId, schoolId: context.schoolId },
      select: { id: true, schoolId: true, studentId: true, termId: true, balance: true, status: true },
    }),
  ])

  if (!configuration?.isEnabled || configuration.status !== "READY" || !configuration.verifiedAt) {
    throw new Error("This school has not enabled online payments")
  }
  if (configuration.accountMode === "PLATFORM_MANAGED" && !configuration.subaccountCode) {
    throw new Error("The school's settlement connection is incomplete")
  }
  if (configuration.accountMode === "SCHOOL_OWNED" && !configuration.credential) {
    throw new Error("The school's Paystack connection is incomplete")
  }
  const allowedChannels = Array.isArray(configuration.allowedChannels)
    ? configuration.allowedChannels.filter((value): value is "card" | "bank_transfer" => value === "card" || value === "bank_transfer")
    : []
  if (allowedChannels.length === 0) throw new Error("This school has no online payment channel enabled")
  if (charges.length !== new Set(chargeIds).size) throw new Error("One or more selected charges were not found")

  const validated = validateCheckoutCharges(charges, {
    schoolId: context.schoolId,
    studentId,
    allowPartialPayments: configuration.allowPartialPayments,
  }, requestedAllocations)
  const pilotProblem = liveCheckoutProblems({
    environment,
    liveApprovedAt: configuration.liveApprovedAt,
    pilotMaxKobo: configuration.pilotMaxAmount === null ? null : decimalNairaToKobo(configuration.pilotMaxAmount),
    schoolFeesKobo: validated.schoolFeesKobo,
  })[0]
  if (pilotProblem) throw new Error(pilotProblem)

  const totals = configuration.feePolicy === "PARENT_PAYS_GROSS_UP"
    ? grossUpStandardNigeriaLocalFeeKobo(validated.schoolFeesKobo)
    : { schoolFeesKobo: validated.schoolFeesKobo, processingFeeKobo: 0, parentChargeKobo: validated.schoolFeesKobo }

  /**
   * What DigiSchool keeps, for a school collecting through DigiSchool's own Paystack.
   *
   * It comes out of the school's settlement rather than being added to the parent's bill,
   * so nothing the parent sees or the receipt credits changes. A school on its own keys
   * settles directly and owes the platform nothing on the transaction.
   */
  const platformChargeKoboValue = configuration.accountMode === "PLATFORM_MANAGED"
    ? platformChargeKobo({
        type: configuration.platformChargeType,
        value: configuration.platformChargeValue,
        schoolFeesKobo: totals.schoolFeesKobo,
        // Under a gross-up the payer already covered Paystack's fee, so it does not come
        // out of the school's share and the whole fee total is there to take from.
        providerFeeKobo: configuration.feePolicy === "PARENT_PAYS_GROSS_UP"
          ? 0
          : standardNigeriaLocalFeeKobo(totals.parentChargeKobo),
      })
    : 0

  return {
    ...context,
    environment,
    configuration,
    allowedChannels,
    ...validated,
    totals,
    platformChargeKobo: platformChargeKoboValue,
  }
}

export async function getOnlinePaymentQuote(input: unknown): Promise<ActionResult<{
  schoolFeesKobo: number
  processingFeeKobo: number
  parentChargeKobo: number
  feePolicy: "SCHOOL_PAYS" | "PARENT_PAYS_GROSS_UP"
  environment: "TEST" | "LIVE"
}>> {
  try {
    const data = selectionSchema.parse(input)
    const checkout = await loadCheckoutInput(
      data.studentId,
      [...new Set(data.chargeIds)],
      data.allocations,
    )
    return {
      success: true,
      data: {
        ...checkout.totals,
        feePolicy: checkout.configuration.feePolicy === "PARENT_PAYS_GROSS_UP" ? "PARENT_PAYS_GROSS_UP" : "SCHOOL_PAYS",
        environment: checkout.environment,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not prepare online payment" }
  }
}

export async function initializeOnlinePayment(input: unknown): Promise<ActionResult<{
  reference: string
  authorizationUrl: string | null
  statusUrl: string
  reused: boolean
}>> {
  let createdId: string | null = null
  try {
    const data = selectionSchema.parse(input)
    const uniqueChargeIds = [...new Set(data.chargeIds)]
    const checkout = await loadCheckoutInput(data.studentId, uniqueChargeIds, data.allocations)
    const paymentReference = reference()
    const statusPath = `/dashboard/parent/children/${checkout.studentId}/fees/online/${paymentReference}`

    const reservation = await prisma.$transaction(async (tx) => {
      const activeCandidates = await tx.gatewayTransaction.findMany({
        where: {
          studentId: checkout.studentId,
          schoolId: checkout.schoolId,
          OR: [
            { status: { in: [...ACTIVE_CHECKOUT_STATUSES] } },
            { status: "ABANDONED", expiresAt: { gt: new Date() } },
          ],
          allocations: { some: { chargeId: { in: uniqueChargeIds } } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          reference: true,
          providerMetadata: true,
          allocations: { select: { chargeId: true, amount: true } },
        },
      })
      const requestedByCharge = new Map(
        checkout.allocations.map((allocation) => [allocation.chargeId, allocation.amountKobo]),
      )
      const active = activeCandidates.find((candidate) =>
        candidate.allocations.length === requestedByCharge.size
        && candidate.allocations.every((allocation) =>
          requestedByCharge.get(allocation.chargeId) === decimalNairaToKobo(allocation.amount),
        ),
      )
      if (active) {
        const metadata = active.providerMetadata as { authorizationUrl?: unknown } | null
        return {
          reused: true as const,
          id: null,
          reference: active.reference,
          authorizationUrl: typeof metadata?.authorizationUrl === "string" ? metadata.authorizationUrl : null,
        }
      }
      if (activeCandidates.length > 0) {
        throw new Error("An active checkout already exists for one or more selected fees. Complete or abandon it before changing the amount.")
      }

      const freshCharges = await tx.studentCharge.findMany({
        where: { id: { in: uniqueChargeIds }, studentId: checkout.studentId, schoolId: checkout.schoolId },
        select: { id: true, schoolId: true, studentId: true, termId: true, balance: true, status: true },
      })
      const currentConfiguration = await tx.schoolPaymentConfiguration.findUnique({
        where: { id: checkout.configuration.id },
        select: { isEnabled: true, status: true, configVersion: true },
      })
      if (!currentConfiguration?.isEnabled || currentConfiguration.status !== "READY"
        || currentConfiguration.configVersion !== checkout.configuration.configVersion) {
        throw new Error("The school's payment configuration changed. Review the payment again.")
      }
      const fresh = validateCheckoutCharges(freshCharges, {
        schoolId: checkout.schoolId,
        studentId: checkout.studentId,
        allowPartialPayments: checkout.configuration.allowPartialPayments,
      }, checkout.allocations)
      if (fresh.schoolFeesKobo !== checkout.totals.schoolFeesKobo) {
        throw new Error("A selected balance changed. Review the updated amount before continuing.")
      }

      const row = await tx.gatewayTransaction.create({
        data: {
          schoolId: checkout.schoolId,
          studentId: checkout.studentId,
          termId: fresh.termId,
          configurationId: checkout.configuration.id,
          environment: checkout.environment,
          reference: paymentReference,
          status: "CREATED",
          amountExpected: koboToDecimalNaira(checkout.totals.schoolFeesKobo),
          amountRequested: koboToDecimalNaira(checkout.totals.parentChargeKobo),
          payerEmail: checkout.payerEmail,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          configurationSnapshot: {
            version: checkout.configuration.configVersion,
            accountMode: checkout.configuration.accountMode,
            feePolicy: checkout.configuration.feePolicy,
            processingFeeKobo: checkout.totals.processingFeeKobo,
            // Snapshotted like everything else here, so raising the platform charge
            // tomorrow cannot rewrite what was taken from a payment made today.
            platformChargeKobo: checkout.platformChargeKobo,
            pricing: checkout.configuration.feePolicy === "PARENT_PAYS_GROSS_UP"
              ? { code: "PAYSTACK_NG_LOCAL_STANDARD_2026_09", rateBasisPoints: 150, flatKobo: 10_000, waiverBelowKobo: 250_000, capKobo: 200_000 }
              : null,
            allowedChannels: checkout.allowedChannels,
            subaccountCode: checkout.configuration.subaccountCode,
          },
          allocations: {
            create: fresh.allocations.map((allocation) => ({
              chargeId: allocation.chargeId,
              amount: koboToDecimalNaira(allocation.amountKobo),
            })),
          },
        },
        select: { id: true, reference: true },
      })
      return { reused: false as const, id: row.id, reference: row.reference, authorizationUrl: null }
    }, { isolationLevel: "Serializable" })

    if (reservation.reused) {
      return {
        success: true,
        data: {
          reference: reservation.reference,
          authorizationUrl: reservation.authorizationUrl,
          statusUrl: `/dashboard/parent/children/${checkout.studentId}/fees/online/${reservation.reference}`,
          reused: true,
        },
      }
    }
    createdId = reservation.id

    const adapter = await adapterForPaymentConfiguration(checkout.configuration.id)
    const initialized = await adapter.initializePayment({
      email: checkout.payerEmail,
      amountKobo: checkout.totals.parentChargeKobo,
      reference: reservation.reference,
      callbackUrl: `${applicationOrigin()}${statusPath}`,
      currency: "NGN",
      channels: checkout.allowedChannels,
      ...(checkout.configuration.accountMode === "PLATFORM_MANAGED"
        ? {
            subaccountCode: checkout.configuration.subaccountCode!,
            feeBearer: "subaccount" as const,
            // Held back in DigiSchool's account; the rest settles to the school's
            // subaccount. It does not change the total the parent is debited.
            ...(checkout.platformChargeKobo > 0
              ? { transactionChargeKobo: checkout.platformChargeKobo }
              : {}),
          }
        : {}),
      metadata: { gatewayTransactionId: reservation.id, schoolId: checkout.schoolId, studentId: checkout.studentId },
    })

    await prisma.gatewayTransaction.update({
      where: { id: reservation.id, status: "CREATED" },
      data: {
        status: "INITIALIZED",
        initializedAt: new Date(),
        providerMetadata: { accessCode: initialized.accessCode, authorizationUrl: initialized.authorizationUrl },
      },
    })
    await recordAudit({
      actor: checkout.actor,
      schoolId: checkout.schoolId,
      action: "payment_gateway.checkout_initialize",
      entityType: "GatewayTransaction",
      entityId: reservation.id,
      summary: `Initialized online fee payment ${reservation.reference}`,
      after: { reference: reservation.reference, environment: checkout.environment, amountKobo: checkout.totals.parentChargeKobo },
    })

    return {
      success: true,
      data: { reference: reservation.reference, authorizationUrl: initialized.authorizationUrl, statusUrl: statusPath, reused: false },
    }
  } catch (error) {
    if (createdId) {
      const definitelyRejected = error instanceof PaystackApiError && error.httpStatus !== undefined && error.httpStatus < 500
      await prisma.gatewayTransaction.updateMany({
        where: { id: createdId, status: "CREATED" },
        data: {
          status: definitelyRejected ? "FAILED" : "INITIALIZATION_UNKNOWN",
          failureCode: error instanceof PaystackApiError ? error.code ?? null : null,
          failureMessage: definitelyRejected ? "Paystack rejected the checkout initialization" : "Checkout initialization result is uncertain",
        },
      }).catch(() => undefined)
    }
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof PaystackApiError
        ? "Paystack could not safely initialize this payment. Check the payment status before trying again."
        : error instanceof Error ? error.message : null
    return { success: false, error: message ?? "Could not initialize online payment" }
  }
}

async function ownedGatewayTransaction(studentId: string, transactionReference: string) {
  const context = await parentCheckoutContext(studentId)
  const transaction = await prisma.gatewayTransaction.findFirst({
    where: { reference: transactionReference, studentId, schoolId: context.schoolId },
    include: {
      allocations: { select: { amount: true, charge: { select: { feeSchedule: { select: { name: true } } } } } },
      payment: { select: { id: true, receiptNo: true } },
    },
  })
  if (!transaction) throw new Error("Payment attempt was not found")
  return { context, transaction }
}

export async function getOnlinePaymentStatus(studentId: string, transactionReference: string): Promise<ActionResult<{
  reference: string
  status: GatewayTransactionStatus
  amountExpected: string
  amountRequested: string | null
  createdAt: string
  expiresAt: string | null
  authorizationUrl: string | null
  allocations: Array<{ name: string; amount: string }>
  receipt: { id: string; receiptNo: string } | null
}>> {
  try {
    const { transaction } = await ownedGatewayTransaction(studentId, transactionReference)
    const metadata = transaction.providerMetadata as { authorizationUrl?: unknown } | null
    return {
      success: true,
      data: {
        reference: transaction.reference,
        status: transaction.status,
        amountExpected: transaction.amountExpected.toFixed(2),
        amountRequested: transaction.amountRequested?.toFixed(2) ?? null,
        createdAt: transaction.createdAt.toISOString(),
        expiresAt: transaction.expiresAt?.toISOString() ?? null,
        authorizationUrl: typeof metadata?.authorizationUrl === "string" ? metadata.authorizationUrl : null,
        allocations: transaction.allocations.map((allocation) => ({
          name: allocation.charge.feeSchedule.name,
          amount: allocation.amount.toFixed(2),
        })),
        receipt: transaction.payment,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load payment status" }
  }
}

export async function refreshOnlinePaymentStatus(input: unknown): Promise<ActionResult<{ status: GatewayTransactionStatus }>> {
  try {
    const data = z.object({ studentId: z.string().uuid(), reference: z.string().min(1).max(191) }).parse(input)
    const { transaction } = await ownedGatewayTransaction(data.studentId, data.reference)
    if (["SUCCEEDED", "FAILED", "REFUNDED", "DISPUTED", "REQUIRES_REVIEW"].includes(transaction.status)) {
      return { success: true, data: { status: transaction.status } }
    }
    if (!transaction.configurationId) throw new Error("The payment connection is no longer available")

    const verified = await (await adapterForPaymentConfiguration(transaction.configurationId)).verifyPayment(transaction.reference)
    const snapshot = transaction.configurationSnapshot as {
      accountMode?: unknown
      subaccountCode?: unknown
      processingFeeKobo?: unknown
      feePolicy?: unknown
    } | null
    const expectedRequestedKobo = transaction.amountRequested
      ? Math.round(transaction.amountRequested.toNumber() * 100)
      : Math.round(transaction.amountExpected.toNumber() * 100)
    const expectedSubaccount = typeof snapshot?.subaccountCode === "string" ? snapshot.subaccountCode : null
    const expectedSchoolFeesKobo = Math.round(transaction.amountExpected.toNumber() * 100)
    const allocationTotalKobo = transaction.allocations.reduce(
      (total, allocation) => total + Math.round(allocation.amount.toNumber() * 100), 0,
    )
    const accountMode = snapshot?.accountMode === "SCHOOL_OWNED" ? "SCHOOL_OWNED" : "PLATFORM_MANAGED"
    const feePolicy = snapshot?.feePolicy === "PARENT_PAYS_GROSS_UP"
      ? "PARENT_PAYS_GROSS_UP" : snapshot?.feePolicy === "PLATFORM_PAYS" ? "PLATFORM_PAYS" : "SCHOOL_PAYS"
    const localVerification: LocalGatewayVerification = {
      reference: transaction.reference,
      environment: transaction.environment,
      requestedAmountKobo: expectedRequestedKobo,
      expectedSchoolFeesKobo,
      allocationTotalKobo,
      accountMode,
      expectedSubaccountCode: expectedSubaccount,
      feePolicy,
      disclosedProcessingFeeKobo: typeof snapshot?.processingFeeKobo === "number" ? snapshot.processingFeeKobo : 0,
    }
    // Failed and abandoned attempts commonly report zero amounts. First prove that the
    // response belongs to this immutable checkout, then classify the provider status.
    // Full money and settlement checks apply only when Paystack says it was successful.
    const problems = verified.status === "success"
      ? gatewayVerificationProblems(localVerification, verified)
      : gatewayVerificationIdentityProblems(localVerification, verified)

    if (problems.length > 0) {
      await prisma.gatewayTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "REQUIRES_REVIEW",
          providerTransactionId: verified.providerTransactionId,
          amountCharged: koboToDecimalNaira(verified.amountKobo),
          providerFee: koboToDecimalNaira(verified.feesKobo),
          verifiedAt: new Date(),
          failureMessage: `Paystack verification did not match the immutable local checkout: ${problems.join("; ")}`,
        },
      })
      return { success: true, data: { status: "REQUIRES_REVIEW" } }
    }
    if (verified.status === "success") {
      // Paystack's verify endpoint, called server-side with the secret key, is as
      // authoritative as a signed webhook. Post now rather than wait for a webhook that may
      // never arrive; the shared poster is idempotent, so a late webhook finds it done.
      await postVerifiedCheckoutSuccess(transaction.id, verified, null)
      const posted = await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id }, select: { status: true } })
      revalidatePath(`/dashboard/parent/children/${data.studentId}/fees`)
      revalidatePath(`/dashboard/parent/children/${data.studentId}/fees/online/${data.reference}`)
      return { success: true, data: { status: posted.status } }
    }
    let status: GatewayTransactionStatus = "PENDING"
    if (["failed", "reversed"].includes(verified.status)) status = "FAILED"
    else if (verified.status === "abandoned") status = "ABANDONED"

    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status,
        providerTransactionId: verified.providerTransactionId,
        amountCharged: koboToDecimalNaira(verified.amountKobo),
        providerFee: koboToDecimalNaira(verified.feesKobo),
        channel: verified.channel,
        verifiedAt: new Date(),
        ...(verified.paidAt ? { paidAt: verified.paidAt } : {}),
      },
    })
    revalidatePath(`/dashboard/parent/children/${data.studentId}/fees/online/${data.reference}`)
    return { success: true, data: { status } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not refresh payment status" }
  }
}

export async function abandonOnlinePayment(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const data = z.object({ studentId: z.string().uuid(), reference: z.string().min(1).max(191) }).parse(input)
    const { context, transaction } = await ownedGatewayTransaction(data.studentId, data.reference)
    const changed = await prisma.gatewayTransaction.updateMany({
      where: { id: transaction.id, status: { in: ["CREATED", "INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING"] } },
      data: { status: "ABANDONED" },
    })
    if (changed.count !== 1) throw new Error("This payment can no longer be abandoned")
    await recordAudit({
      actor: context.actor,
      schoolId: context.schoolId,
      action: "payment_gateway.checkout_abandon",
      entityType: "GatewayTransaction",
      entityId: transaction.id,
      summary: `Parent abandoned online payment ${transaction.reference}`,
      before: { status: transaction.status },
      after: { status: "ABANDONED" },
    })
    revalidatePath(`/dashboard/parent/children/${data.studentId}/fees`)
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not abandon payment" }
  }
}

/**
 * Online payments for this child that Paystack has not finished confirming, for the fees
 * page. A parent who paid and came back should see "being confirmed", not an unchanged
 * balance that looks like the money vanished.
 */
export async function getPendingOnlinePayments(studentId: string): Promise<Array<{
  reference: string
  status: GatewayTransactionStatus
  amount: string
  createdAt: string
}>> {
  try {
    const context = await parentCheckoutContext(studentId)
    const rows = await prisma.gatewayTransaction.findMany({
      where: {
        studentId, schoolId: context.schoolId, source: "CHECKOUT",
        status: { in: ["INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING", "PROCESSING", "REQUIRES_REVIEW"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { reference: true, status: true, amountCharged: true, amountRequested: true, amountExpected: true, createdAt: true },
    })
    return rows.map((row) => ({
      reference: row.reference,
      status: row.status,
      amount: (row.amountCharged ?? row.amountRequested ?? row.amountExpected).toFixed(2),
      createdAt: row.createdAt.toISOString(),
    }))
  } catch {
    return []
  }
}
