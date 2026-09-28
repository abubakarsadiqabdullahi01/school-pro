import { Prisma, type GatewayEventStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { postStudentPaymentInTransaction, reverseStudentPaymentInTransaction } from "@/lib/finance/payment-ledger.server"
import { decimalNairaToKobo, koboToDecimalNaira } from "./checkout-rules"
import {
  assertGatewayTransactionTransition,
  canTransitionGatewayTransaction,
} from "./gateway-state"
import { processDedicatedTransferEvent } from "./dedicated-transfer.server"
import { processIdentificationEvent } from "./dedicated-accounts.server"
import { adapterForPaymentConfiguration } from "./payment-settings.server"
import { queuePaymentReceiptInTransaction } from "@/lib/notifications/payment-receipt.server"
import type { VerifiedGatewayPayment } from "./contracts"
import {
  gatewayVerificationIdentityProblems,
  gatewayVerificationProblems,
  type LocalGatewayVerification,
} from "./verification-rules"

type ProcessResult = "processed" | "ignored" | "already_processed" | "busy" | "failed"

function retryAt(attempts: number): Date {
  const seconds = Math.min(6 * 60 * 60, 60 * 2 ** Math.min(Math.max(attempts - 1, 0), 8))
  return new Date(Date.now() + seconds * 1000)
}

async function finishEvent(eventId: string, status: GatewayEventStatus, lastError?: string | null) {
  await prisma.gatewayEvent.update({
    where: { id: eventId },
    data: {
      status,
      processedAt: ["PROCESSED", "IGNORED"].includes(status) ? new Date() : null,
      nextAttemptAt: status === "FAILED" ? new Date(Date.now() + 60_000) : null,
      lastError: lastError?.slice(0, 10_000) ?? null,
    },
  })
}

function eventData(payload: Prisma.JsonValue | null): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}
  const data = (payload as Record<string, unknown>).data
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

async function processRefundEvent(event: NonNullable<Awaited<ReturnType<typeof prisma.gatewayEvent.findUnique>>>) {
  const data = eventData(event.payload)
  const providerRefundId = textValue(data.id)
  // A transaction can carry more than one refund (held money, then the applied part), so the
  // provider's refund id decides. Without one, only a single submitted refund can match.
  const refund = (providerRefundId
    ? await prisma.gatewayRefund.findFirst({ where: { provider: event.provider, environment: event.environment, providerRefundId } })
    : null)
    ?? (event.gatewayTransactionId
      ? await prisma.gatewayRefund.findFirst({
          where: { provider: event.provider, environment: event.environment, gatewayTransactionId: event.gatewayTransactionId,
            approvedAt: { not: null }, status: { in: ["PENDING", "PROCESSING", "NEEDS_ATTENTION"] } },
          orderBy: { approvedAt: "desc" },
        })
      : null)
  if (!refund) {
    await finishEvent(event.id, "IGNORED", "No local refund request matched this provider event")
    return "ignored" as const
  }
  const status = event.eventType === "refund.processed" ? "PROCESSED"
    : event.eventType === "refund.failed" ? "FAILED"
      : event.eventType === "refund.needs-attention" ? "NEEDS_ATTENTION"
        : event.eventType === "refund.processing" ? "PROCESSING" : "PENDING"

  await prisma.$transaction(async (tx) => {
    const current = await tx.gatewayRefund.findUniqueOrThrow({ where: { id: refund.id } })
    if (status === "PROCESSED" && current.status !== "PROCESSED") {
      if (current.unappliedPaymentId) {
        // Held money never reached a receipt, so there is nothing to reverse: the held row
        // simply records that it went back to the payer.
        await tx.unappliedPayment.update({
          where: { id: current.unappliedPaymentId },
          data: { status: "RETURNED", resolvedBy: current.approvedBy ?? current.requestedBy, resolvedAt: new Date(),
            resolutionNote: `Refunded through Paystack (${current.providerRefundId ?? event.reference ?? "refund"})` },
        })
      } else if (current.paymentId) {
        await reverseStudentPaymentInTransaction(tx, {
          schoolId: current.schoolId, paymentId: current.paymentId,
          reason: current.reason, referenceNo: current.providerRefundId ?? event.reference,
          createdBy: current.requestedBy,
        })
        await tx.gatewayTransaction.update({ where: { id: current.gatewayTransactionId }, data: { status: "REFUNDED" } })
      }
    }
    await tx.gatewayRefund.update({
      where: { id: current.id },
      data: { status, providerRefundId: providerRefundId ?? current.providerRefundId,
        processedAt: status === "PROCESSED" ? new Date() : current.processedAt,
        failedAt: status === "FAILED" ? new Date() : null,
        providerMessage: status === "FAILED" ? textValue(data.reason) ?? "Provider reported refund failure"
          : status === "NEEDS_ATTENTION" ? "Paystack needs the payer's bank account to complete this refund" : null },
    })
    await tx.gatewayEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null } })
  }, { isolationLevel: "Serializable" })
  return "processed" as const
}

async function processDisputeEvent(event: NonNullable<Awaited<ReturnType<typeof prisma.gatewayEvent.findUnique>>>) {
  const data = eventData(event.payload)
  const providerDisputeId = textValue(data.id)
  if (!providerDisputeId || !event.schoolId) {
    await finishEvent(event.id, "IGNORED", "Dispute event did not identify a school and provider dispute")
    return "ignored" as const
  }
  const status = textValue(data.status) ?? (event.eventType.endsWith(".resolve") ? "resolved" : "awaiting-merchant-feedback")
  const amountKobo = typeof data.amount === "number" && Number.isSafeInteger(data.amount) ? data.amount : null
  await prisma.$transaction([
    prisma.gatewayDispute.upsert({
      where: { provider_environment_providerDisputeId: { provider: event.provider, environment: event.environment, providerDisputeId } },
      create: { schoolId: event.schoolId, gatewayTransactionId: event.gatewayTransactionId, provider: event.provider,
        environment: event.environment, providerDisputeId, status,
        amount: amountKobo === null ? null : koboToDecimalNaira(amountKobo), currency: textValue(data.currency),
        reason: textValue(data.reason), category: textValue(data.category),
        dueAt: textValue(data.dueAt) ? new Date(textValue(data.dueAt)!) : null,
        resolution: textValue(data.resolution), lastEventType: event.eventType,
        resolvedAt: event.eventType.endsWith(".resolve") ? new Date() : null },
      update: { gatewayTransactionId: event.gatewayTransactionId, status,
        amount: amountKobo === null ? undefined : koboToDecimalNaira(amountKobo), currency: textValue(data.currency) ?? undefined,
        reason: textValue(data.reason) ?? undefined, category: textValue(data.category) ?? undefined,
        dueAt: textValue(data.dueAt) ? new Date(textValue(data.dueAt)!) : undefined,
        resolution: textValue(data.resolution), lastEventType: event.eventType, lastEventAt: new Date(),
        resolvedAt: event.eventType.endsWith(".resolve") ? new Date() : undefined },
    }),
    ...(event.gatewayTransactionId && !event.eventType.endsWith(".resolve")
      ? [prisma.gatewayTransaction.update({ where: { id: event.gatewayTransactionId }, data: { status: "DISPUTED" } })] : []),
    prisma.gatewayEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null } }),
  ])
  return "processed" as const
}

export async function processGatewayEvent(eventId: string): Promise<ProcessResult> {
  const staleClaim = new Date(Date.now() - 10 * 60 * 1000)
  const claimed = await prisma.gatewayEvent.updateMany({
    where: {
      id: eventId,
      OR: [
        { status: "PENDING" },
        { status: "FAILED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { status: "PROCESSING", claimedAt: { lte: staleClaim } },
      ],
    },
    data: { status: "PROCESSING", claimedAt: new Date(), attempts: { increment: 1 } },
  })
  if (claimed.count !== 1) return "busy"

  const event = await prisma.gatewayEvent.findUnique({
    where: { id: eventId },
    include: { gatewayTransaction: { include: { allocations: true } } },
  })
  if (!event) return "busy"

  try {
    if (["refund.pending", "refund.processing", "refund.processed", "refund.failed", "refund.needs-attention"].includes(event.eventType)) {
      return await processRefundEvent(event)
    }
    if (["customeridentification.success", "customeridentification.failed"].includes(event.eventType)) {
      return await processIdentificationEvent(event)
    }
    if (["charge.dispute.create", "charge.dispute.remind", "charge.dispute.resolve"].includes(event.eventType)) {
      return await processDisputeEvent(event)
    }
    if (!["charge.success", "charge.failed"].includes(event.eventType)) {
      await finishEvent(event.id, "IGNORED", `No gateway handler for ${event.eventType}`)
      return "ignored"
    }
    const transaction = event.gatewayTransaction
    if (!transaction && event.eventType === "charge.success" && eventData(event.payload).channel === "dedicated_nuban") {
      return await processDedicatedTransferEvent(event)
    }
    if (!transaction || !transaction.configurationId || !event.reference) {
      await finishEvent(event.id, "IGNORED", "No local gateway transaction matched this event")
      return "ignored"
    }
    if (transaction.paymentId && transaction.status === "SUCCEEDED") {
      await finishEvent(event.id, "PROCESSED")
      return "already_processed"
    }

    const verified = await (await adapterForPaymentConfiguration(transaction.configurationId)).verifyPayment(event.reference)

    const snapshot = transaction.configurationSnapshot as {
      accountMode?: unknown
      subaccountCode?: unknown
      processingFeeKobo?: unknown
      feePolicy?: unknown
    } | null
    const requestedAmountKobo = transaction.amountRequested
      ? decimalNairaToKobo(transaction.amountRequested)
      : decimalNairaToKobo(transaction.amountExpected)
    const expectedSchoolFeesKobo = decimalNairaToKobo(transaction.amountExpected)
    const allocationTotalKobo = transaction.allocations.reduce(
      (total, allocation) => total + decimalNairaToKobo(allocation.amount), 0,
    )
    const accountMode = snapshot?.accountMode === "SCHOOL_OWNED" ? "SCHOOL_OWNED" : "PLATFORM_MANAGED"
    const feePolicy = snapshot?.feePolicy === "PARENT_PAYS_GROSS_UP"
      ? "PARENT_PAYS_GROSS_UP" : snapshot?.feePolicy === "PLATFORM_PAYS" ? "PLATFORM_PAYS" : "SCHOOL_PAYS"
    const localVerification: LocalGatewayVerification = {
      reference: transaction.reference,
      environment: transaction.environment,
      requestedAmountKobo,
      expectedSchoolFeesKobo,
      allocationTotalKobo,
      accountMode,
      expectedSubaccountCode: typeof snapshot?.subaccountCode === "string" ? snapshot.subaccountCode : null,
      feePolicy,
      disclosedProcessingFeeKobo: typeof snapshot?.processingFeeKobo === "number" ? snapshot.processingFeeKobo : 0,
    }
    const problems = verified.status === "success"
      ? gatewayVerificationProblems(localVerification, verified)
      : gatewayVerificationIdentityProblems(localVerification, verified)

    if (problems.length > 0) {
      await prisma.$transaction([
        prisma.gatewayTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "REQUIRES_REVIEW",
            providerTransactionId: verified.providerTransactionId,
            amountCharged: koboToDecimalNaira(verified.amountKobo),
            providerFee: koboToDecimalNaira(verified.feesKobo),
            verifiedAt: new Date(),
            paidAt: verified.paidAt,
            channel: verified.channel,
            failureMessage: problems.join("; "),
          },
        }),
        prisma.gatewayEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: `Quarantined: ${problems.join("; ")}` },
        }),
      ])
      return "processed"
    }

    if (verified.status !== "success") {
      if (event.eventType !== "charge.failed"
        || !["failed", "reversed", "abandoned"].includes(verified.status)) {
        throw new Error(`Provider verification is ${verified.status}`)
      }
      const targetStatus = verified.status === "abandoned" ? "ABANDONED" as const : "FAILED" as const
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM GatewayTransaction WHERE id = ${transaction.id} FOR UPDATE`)
        const locked = await tx.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id } })
        if (locked.paymentId) {
          await tx.gatewayEvent.update({
            where: { id: event.id },
            data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null },
          })
          return
        }
        assertGatewayTransactionTransition(locked.status, targetStatus)
        await tx.gatewayTransaction.update({
          where: { id: locked.id },
          data: {
            status: targetStatus,
            providerTransactionId: verified.providerTransactionId,
            amountCharged: koboToDecimalNaira(verified.amountKobo),
            providerFee: koboToDecimalNaira(verified.feesKobo),
            channel: verified.channel,
            verifiedAt: new Date(),
            failureCode: `paystack_${verified.status}`,
            failureMessage: `Paystack reported this payment as ${verified.status}`,
          },
        })
        await tx.gatewayEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null },
        })
      }, { isolationLevel: "Serializable" })
      return "processed"
    }

    await postVerifiedCheckoutSuccess(transaction.id, verified, event.id)
    return "processed"
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown gateway event processing error"
    await prisma.gatewayEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        claimedAt: null,
        nextAttemptAt: retryAt(event.attempts),
        lastError: message.slice(0, 10_000),
      },
    }).catch(() => undefined)
    return "failed"
  }
}

export async function processPendingGatewayEvents(limit = 20): Promise<Record<ProcessResult, number>> {
  const boundedLimit = Math.max(1, Math.min(limit, 100))
  const staleClaim = new Date(Date.now() - 10 * 60 * 1000)
  const candidates = await prisma.gatewayEvent.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { status: "PROCESSING", claimedAt: { lte: staleClaim } },
      ],
    },
    orderBy: { receivedAt: "asc" },
    take: boundedLimit,
    select: { id: true },
  })
  const summary: Record<ProcessResult, number> = { processed: 0, ignored: 0, already_processed: 0, busy: 0, failed: 0 }
  for (const candidate of candidates) summary[await processGatewayEvent(candidate.id)] += 1
  return summary
}

/**
 * Posts a checkout Paystack has verified as successful: one payment, the intended
 * allocations, the school's receipt messages, and the transaction marked SUCCEEDED — or
 * review, if its local state forbids success. Called by the webhook processor and by the
 * parent's status refresh, so a lost webhook cannot leave paid money unreceipted. The row
 * lock and linked payment make it idempotent: whichever runs second finds it done.
 */
export async function postVerifiedCheckoutSuccess(
  transactionId: string,
  verified: VerifiedGatewayPayment,
  eventId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM GatewayTransaction WHERE id = ${transactionId} FOR UPDATE`)
    const locked = await tx.gatewayTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { allocations: true },
    })
    if (locked.paymentId) {
      if (eventId) await tx.gatewayEvent.update({
        where: { id: eventId },
        data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null },
      })
      return
    }
    if (!canTransitionGatewayTransaction(locked.status, "SUCCEEDED")) {
      assertGatewayTransactionTransition(locked.status, "REQUIRES_REVIEW")
      await tx.gatewayTransaction.update({
        where: { id: locked.id },
        data: {
          status: "REQUIRES_REVIEW",
          providerTransactionId: verified.providerTransactionId,
          amountCharged: koboToDecimalNaira(verified.amountKobo),
          providerFee: koboToDecimalNaira(verified.feesKobo),
          channel: verified.channel,
          verifiedAt: new Date(),
          paidAt: verified.paidAt ?? new Date(),
          failureMessage: `Verified Paystack success conflicts with terminal local status ${locked.status}`,
        },
      })
      if (eventId) await tx.gatewayEvent.update({
        where: { id: eventId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          nextAttemptAt: null,
          lastError: `Quarantined: verified success conflicts with ${locked.status}`,
        },
      })
      return
    }
    assertGatewayTransactionTransition(locked.status, "SUCCEEDED")

    const payment = await postStudentPaymentInTransaction(tx, {
      schoolId: locked.schoolId,
      studentId: locked.studentId,
      termId: locked.termId,
      paymentDate: verified.paidAt ?? new Date(),
      paymentMethod: verified.channel ? `PAYSTACK_${verified.channel.toUpperCase()}` : "PAYSTACK",
      referenceNo: locked.reference,
      notes: `Confirmed online by Paystack (${locked.reference})`,
      allocations: locked.allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amount: allocation.amount,
      })),
    })
    await tx.gatewayTransaction.update({
      where: { id: locked.id },
      data: {
        status: "SUCCEEDED",
        paymentId: payment.id,
        providerTransactionId: verified.providerTransactionId,
        amountCharged: koboToDecimalNaira(verified.amountKobo),
        providerFee: koboToDecimalNaira(verified.feesKobo),
        channel: verified.channel,
        verifiedAt: new Date(),
        paidAt: verified.paidAt ?? new Date(),
        failureCode: null,
        failureMessage: null,
      },
    })
    await queuePaymentReceiptInTransaction(tx, { schoolId: locked.schoolId, studentId: locked.studentId, paymentId: payment.id, reference: locked.reference, payerEmail: locked.payerEmail })
    if (eventId) await tx.gatewayEvent.update({
      where: { id: eventId },
      data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null },
    })
  }, { isolationLevel: "Serializable" })
}
