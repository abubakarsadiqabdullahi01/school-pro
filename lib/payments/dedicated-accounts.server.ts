import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { checkoutEnvironment } from "./checkout-environment"
import {
  dedicatedAccountReadinessProblems,
  dedicatedBankFor,
  dedicatedCustomerDomain,
  dedicatedCustomerEmail,
  dedicatedSplitShare,
  normalizeNigerianPhone,
} from "./dedicated-account-rules"
import { adapterForPaymentConfiguration, paystackConfigurationForSchool } from "./payment-settings.server"

/*
 * Creating a student's dedicated account, shared by the finance actions and by the webhook
 * processor (which finishes the job once Paystack confirms a customer's identification).
 */

export async function readyConfiguration(schoolId: string) {
  const environment = checkoutEnvironment()
  const configuration = await paystackConfigurationForSchool(schoolId, environment)
  if (!configuration) throw new Error(`Set up the ${environment.toLowerCase()} Paystack connection first`)
  return { environment, configuration }
}

export function readiness(configuration: NonNullable<Awaited<ReturnType<typeof paystackConfigurationForSchool>>>) {
  return dedicatedAccountReadinessProblems({
    environment: configuration.environment,
    isEnabled: configuration.isEnabled,
    status: configuration.status,
    verifiedAt: configuration.verifiedAt,
    dedicatedAccountsEnabled: configuration.dedicatedAccountsEnabled,
    accountMode: configuration.accountMode,
    subaccountCode: configuration.subaccountCode,
    hasCredential: Boolean(configuration.credential),
    liveApprovedAt: configuration.liveApprovedAt,
  })
}

type ReadyConfiguration = NonNullable<Awaited<ReturnType<typeof paystackConfigurationForSchool>>>

/**
 * The split a DigiSchool-managed school's dedicated accounts settle through, created on first
 * use. It makes the school's subaccount bear Paystack's fee (a bare subaccount would leave the
 * fee on DigiSchool's main account) and gives DigiSchool its platform percentage.
 */
async function ensureDedicatedSplit(configuration: ReadyConfiguration): Promise<string | undefined> {
  if (configuration.accountMode !== "PLATFORM_MANAGED" || !configuration.subaccountCode) return undefined
  if (configuration.dedicatedSplitCode) return configuration.dedicatedSplitCode
  const { schoolShare } = dedicatedSplitShare(configuration.platformChargeType, configuration.platformChargeValue.toNumber())
  const school = await prisma.school.findUniqueOrThrow({ where: { id: configuration.schoolId }, select: { code: true } })
  const split = await (await adapterForPaymentConfiguration(configuration.id)).createSplit({
    name: `DigiSchool DVA ${school.code}`.slice(0, 100),
    subaccountCode: configuration.subaccountCode,
    subaccountShare: schoolShare,
  })
  // Another request may have created one at the same moment; keep whichever was saved first.
  await prisma.schoolPaymentConfiguration.updateMany({
    where: { id: configuration.id, dedicatedSplitCode: null },
    data: { dedicatedSplitCode: split.splitCode, dedicatedSplitId: split.splitId, dedicatedSplitShare: schoolShare },
  })
  const saved = await prisma.schoolPaymentConfiguration.findUniqueOrThrow({ where: { id: configuration.id }, select: { dedicatedSplitCode: true } })
  return saved.dedicatedSplitCode ?? split.splitCode
}

/**
 * Creates one student's account at Paystack. Paystack is written first and the row second:
 * if the row write fails after Paystack succeeded, trying again finds the same customer and
 * account (Paystack returns them for the same email) and the unique account id stops a
 * second row, so a retry repairs rather than duplicates.
 */
export async function assignDedicatedAccountForStudent(schoolId: string, actorUserId: string, studentId: string) {
  const { environment, configuration } = await readyConfiguration(schoolId)
  const problem = readiness(configuration)[0]
  if (problem) throw new Error(problem)

  const existing = await prisma.dedicatedAccount.findFirst({
    where: { studentId, schoolId, environment, status: "ACTIVE" },
  })
  if (existing) return { account: existing, created: false }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true, admissionNo: true,
      user: { select: { firstName: true, lastName: true } },
      parents: { select: { parent: { select: { user: { select: { phone: true } } } } } },
    },
  })
  if (!student) throw new Error("Student not found")
  const phone = student.parents.map((link) => normalizeNigerianPhone(link.parent.user.phone)).find(Boolean)
  if (!phone) throw new Error(`Add a valid Nigerian phone number to a parent of ${student.user.firstName} ${student.user.lastName} first`)

  const adapter = await adapterForPaymentConfiguration(configuration.id)
  const customerEmail = dedicatedCustomerEmail(student.id, dedicatedCustomerDomain())
  let customerCode: string
  if (configuration.dedicatedRequiresIdentification) {
    const identification = await prisma.dedicatedCustomerIdentification.findUnique({
      where: { configurationId_studentId: { configurationId: configuration.id, studentId: student.id } },
    })
    if (identification?.status !== "SUCCEEDED") {
      throw new Error(identification?.status === "PENDING"
        ? `Paystack is still checking the payer's identity for ${student.user.firstName} ${student.user.lastName}`
        : `Verify the payer's identity (BVN and bank account) for ${student.user.firstName} ${student.user.lastName} first`)
    }
    customerCode = identification.customerCode
  } else {
    customerCode = (await adapter.createCustomer({
      email: customerEmail,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      phone,
      metadata: { schoolId, studentId: student.id, admissionNo: student.admissionNo },
    })).customerCode
  }
  const splitCode = await ensureDedicatedSplit(configuration)
  const provider = await adapter.createDedicatedAccount({
    customerCode,
    preferredBank: dedicatedBankFor(environment, configuration.dedicatedAccountBank),
    ...(splitCode ? { splitCode } : {}),
  })

  try {
    const account = await prisma.dedicatedAccount.create({
      data: {
        schoolId, studentId: student.id, configurationId: configuration.id, environment,
        providerCustomerCode: customerCode, providerAccountId: provider.providerAccountId,
        customerEmail, accountNumber: provider.accountNumber, accountName: provider.accountName,
        bankName: provider.bankName, bankSlug: provider.bankSlug, createdBy: actorUserId,
      },
    })
    return { account, created: true }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const account = await prisma.dedicatedAccount.findFirstOrThrow({
        where: { provider: "PAYSTACK", environment, providerAccountId: provider.providerAccountId },
      })
      if (account.studentId !== student.id) throw new Error("Paystack returned an account that belongs to another student")
      return { account, created: false }
    }
    throw error
  }
}

/**
 * Paystack's answer to a customer identification. On success the student's account is
 * created straight away; if that step fails (say, a parent's phone went missing), the
 * identification still stands and finance can press "Create account" later.
 */
export async function processIdentificationEvent(event: {
  id: string
  eventType: string
  environment: "TEST" | "LIVE"
  payload: Prisma.JsonValue | null
}): Promise<"processed" | "ignored"> {
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>).data as Record<string, unknown> | undefined
    : undefined
  const customerCode = typeof payload?.customerCode === "string" ? payload.customerCode : null
  const finish = (lastError: string | null, status: "PROCESSED" | "IGNORED" = "PROCESSED") => prisma.gatewayEvent.update({
    where: { id: event.id },
    data: { status, processedAt: new Date(), nextAttemptAt: null, lastError },
  })
  const identification = customerCode
    ? await prisma.dedicatedCustomerIdentification.findFirst({ where: { environment: event.environment, customerCode } })
    : null
  if (!identification) {
    await finish("No pending identification matched this customer", "IGNORED")
    return "ignored"
  }

  if (event.eventType === "customeridentification.failed") {
    const reason = typeof payload?.reason === "string" ? payload.reason.slice(0, 500) : "Paystack could not verify the details"
    await prisma.dedicatedCustomerIdentification.update({ where: { id: identification.id }, data: { status: "FAILED", failureReason: reason } })
    await finish(null)
    return "processed"
  }

  await prisma.dedicatedCustomerIdentification.update({ where: { id: identification.id }, data: { status: "SUCCEEDED", failureReason: null } })
  try {
    await assignDedicatedAccountForStudent(identification.schoolId, identification.requestedBy, identification.studentId)
    await finish(null)
  } catch (error) {
    await finish(`Identified, but the account was not created: ${error instanceof Error ? error.message : "unknown error"}`)
  }
  return "processed"
}
