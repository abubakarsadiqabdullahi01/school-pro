import { Prisma, type GatewayEvent } from "@prisma/client"

import { prisma } from "@/lib/db"
import { postStudentPaymentInTransaction } from "@/lib/finance/payment-ledger.server"
import { formatNaira } from "@/lib/money"
import { queuePaymentReceiptInTransaction } from "@/lib/notifications/payment-receipt.server"
import { koboToDecimalNaira } from "./checkout-rules"
import { dedicatedTransferProblems, isUnfinishedVerification, pickDedicatedAccount, splitDedicatedTransfer } from "./dedicated-account-rules"
import { SETTLED_BY_HAND_PREFIX } from "./gateway-event-notes"
import { adapterForPaymentConfiguration } from "./payment-settings.server"

function eventData(payload: Prisma.JsonValue | null): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}
  const data = (payload as Record<string, unknown>).data
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

function text(value: unknown, max = 191): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null
}

async function markProcessed(tx: Prisma.TransactionClient, eventId: string, extra: { schoolId?: string; gatewayTransactionId?: string; lastError?: string | null } = {}) {
  await tx.gatewayEvent.update({
    where: { id: eventId },
    data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: extra.lastError ?? null,
      ...(extra.schoolId ? { schoolId: extra.schoolId } : {}),
      ...(extra.gatewayTransactionId ? { gatewayTransactionId: extra.gatewayTransactionId } : {}) },
  })
}

/**
 * Records a transfer into a student's dedicated account.
 *
 * There is no checkout behind it: the parent chose the amount at their own bank. So the
 * transfer is verified with Paystack, then — in one serializable transaction, with the
 * student locked so two transfers cannot race for the same balance — it is recorded as a
 * gateway transaction, posted to the student's oldest charges, and any excess is held as
 * unapplied money. A transfer failing verification is recorded but quarantined for review,
 * never credited. The provider reference is unique, so a replayed event posts nothing twice.
 *
 * Throws when no dedicated account matches; the processor then retries with backoff and the
 * event surfaces as failed on the monitor, because real money arrived that nobody owns yet.
 */
export async function processDedicatedTransferEvent(event: GatewayEvent): Promise<"processed" | "already_processed"> {
  const data = eventData(event.payload)
  const reference = event.reference
  if (!reference) throw new Error("Dedicated-account transfer has no reference")
  const customerCode = text(data.customerCode, 64)
  const receiverAccountNumber = text(data.receiverAccountNumber, 20)

  // Somebody already credited this transfer by hand and closed it on the payment monitor.
  // The receipt they made carries no link to the Paystack reference, so this is the only
  // thing standing between a redelivery and the student being credited twice.
  const settledByHand = await prisma.gatewayEvent.findFirst({
    where: { provider: event.provider, environment: event.environment, reference, status: "IGNORED",
      lastError: { startsWith: SETTLED_BY_HAND_PREFIX }, id: { not: event.id } },
    select: { id: true },
  })
  if (settledByHand) {
    await prisma.gatewayEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", processedAt: new Date(), nextAttemptAt: null,
        lastError: "This transfer was settled by hand on the payment monitor, so it is not credited again" },
    })
    return "already_processed"
  }

  if (!receiverAccountNumber && !customerCode) throw new Error("No dedicated account matched this transfer")
  const account = pickDedicatedAccount(await prisma.dedicatedAccount.findMany({
    where: {
      provider: event.provider,
      environment: event.environment,
      // The webhook inbox already knows the school when the event came in on a school's own
      // connection; an account belonging to any other school is never a candidate then.
      ...(event.schoolId ? { schoolId: event.schoolId } : {}),
      OR: [
        ...(receiverAccountNumber ? [{ accountNumber: receiverAccountNumber }] : []),
        ...(customerCode ? [{ providerCustomerCode: customerCode }] : []),
      ],
    },
    include: { configuration: true },
  }), { receiverAccountNumber, customerCode })
  if (!account) throw new Error("No dedicated account matched this transfer")

  const already = await prisma.gatewayTransaction.findUnique({
    where: { provider_reference: { provider: event.provider, reference } },
    select: { id: true },
  })
  if (already) {
    await prisma.$transaction((tx) => markProcessed(tx, event.id, { schoolId: account.schoolId, gatewayTransactionId: already.id }))
    return "already_processed"
  }

  const verified = await (await adapterForPaymentConfiguration(account.configurationId)).verifyPayment(reference)
  // Not a verdict yet. Throwing leaves nothing written and the processor retries with
  // backoff; if Paystack never finishes, the event is parked as DEAD and shows on the monitor.
  if (isUnfinishedVerification(verified.status)) {
    throw new Error(`Paystack has not finished this transfer yet (${verified.status}); it will be verified again`)
  }
  const problems = dedicatedTransferProblems({
    expectedEnvironment: account.environment === "TEST" ? "test" : "live",
    accountMode: account.configuration.accountMode,
    expectedSubaccountCode: account.configuration.subaccountCode,
    expectedSplitCode: account.configuration.dedicatedSplitCode,
    expectedCustomerCode: account.providerCustomerCode,
    expectedAccountNumber: account.accountNumber,
    verified,
  })
  const amount = koboToDecimalNaira(verified.amountKobo)
  const paidAt = verified.paidAt ?? new Date()

  let outcome: "processed" | "already_processed" = "processed"
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM students WHERE id = ${account.studentId} FOR UPDATE`)
    const raced = await tx.gatewayTransaction.findUnique({
      where: { provider_reference: { provider: event.provider, reference } },
      select: { id: true },
    })
    if (raced) {
      outcome = "already_processed"
      await markProcessed(tx, event.id, { schoolId: account.schoolId, gatewayTransactionId: raced.id })
      return
    }

    const charges = problems.length > 0 ? [] : await tx.studentCharge.findMany({
      where: { studentId: account.studentId, schoolId: account.schoolId, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: [{ term: { startDate: "asc" } }, { createdAt: "asc" }],
      select: { id: true, balance: true, termId: true },
    })
    const split = problems.length > 0
      ? { allocations: [], unapplied: 0 }
      : splitDedicatedTransfer(charges.map((charge) => ({ id: charge.id, balance: charge.balance.toNumber() })), amount.toNumber())

    const termId = charges.find((charge) => charge.id === split.allocations[0]?.chargeId)?.termId
      ?? (await tx.term.findFirst({ where: { session: { schoolId: account.schoolId }, isCurrent: true }, select: { id: true } }))?.id
      ?? (await tx.term.findFirst({ where: { session: { schoolId: account.schoolId } }, orderBy: { startDate: "desc" }, select: { id: true } }))?.id
    if (!termId) throw new Error("The school has no term to record the transfer against")

    const transaction = await tx.gatewayTransaction.create({
      data: {
        schoolId: account.schoolId,
        studentId: account.studentId,
        termId,
        configurationId: account.configurationId,
        environment: account.environment,
        reference,
        source: "DEDICATED_ACCOUNT",
        dedicatedAccountId: account.id,
        status: problems.length > 0 ? "REQUIRES_REVIEW" : "SUCCEEDED",
        currency: verified.currency.slice(0, 3),
        amountExpected: amount,
        amountRequested: amount,
        amountCharged: amount,
        providerFee: koboToDecimalNaira(verified.feesKobo),
        providerTransactionId: verified.providerTransactionId,
        channel: verified.channel,
        senderName: text(data.senderName),
        senderBank: text(data.senderBank, 120),
        verifiedAt: new Date(),
        paidAt,
        failureMessage: problems.length > 0 ? problems.join("; ") : null,
        allocations: { create: split.allocations.map((allocation) => ({ chargeId: allocation.chargeId, amount: allocation.amount })) },
      },
    })

    if (problems.length > 0) {
      await markProcessed(tx, event.id, { schoolId: account.schoolId, gatewayTransactionId: transaction.id, lastError: `Quarantined: ${problems.join("; ")}` })
      return
    }

    let paymentId: string | null = null
    if (split.allocations.length > 0) {
      const payment = await postStudentPaymentInTransaction(tx, {
        schoolId: account.schoolId,
        studentId: account.studentId,
        termId,
        paymentDate: paidAt,
        paymentMethod: "PAYSTACK_DEDICATED_NUBAN",
        referenceNo: reference,
        notes: `Bank transfer to dedicated account ${account.accountNumber}`,
        allocations: split.allocations,
      })
      paymentId = payment.id
      await tx.gatewayTransaction.update({ where: { id: transaction.id }, data: { paymentId: payment.id } })
      // The school's full receipt, by email and SMS, to every linked parent.
      await queuePaymentReceiptInTransaction(tx, { schoolId: account.schoolId, studentId: account.studentId, paymentId: payment.id, reference })
    }
    if (split.unapplied > 0) {
      await tx.unappliedPayment.create({
        data: { schoolId: account.schoolId, studentId: account.studentId, gatewayTransactionId: transaction.id, amount: split.unapplied },
      })
      // Money beyond what was owed has no receipt yet, so say plainly what happened to it.
      const [school, links] = await Promise.all([
        tx.school.findUniqueOrThrow({ where: { id: account.schoolId }, select: { name: true } }),
        tx.studentParent.findMany({
          where: { studentId: account.studentId },
          select: { parent: { select: { user: { select: { id: true, notifyByEmail: true, credentials: { where: { type: "EMAIL" }, select: { value: true } } } } } } },
        }),
      ])
      for (const link of links) {
        const user = link.parent.user
        const email = user.credentials[0]?.value.trim().toLowerCase()
        if (!email || !user.notifyByEmail) continue
        await tx.notificationOutbox.create({
          data: {
            schoolId: account.schoolId,
            channel: "EMAIL",
            recipient: email,
            recipientUserId: user.id,
            studentId: account.studentId,
            subject: `${school.name}: transfer received, ${formatNaira(split.unapplied)} held for review`,
            body: `Dear Parent/Guardian,

${school.name} received your bank transfer of ${formatNaira(amount)} to account ${account.accountNumber} (reference ${reference}).

`
              + `${paymentId ? "The fees it covered have been receipted separately. " : ""}${formatNaira(split.unapplied)} is more than the fees currently owed. `
              + `The school's bursar will either apply it to the next fees billed or return it to you.

${school.name}`,
            templateKey: "payment.received",
            dedupeKey: `gateway-transfer:${transaction.id}:held:email:${user.id}`,
          },
        })
      }
    }

    await markProcessed(tx, event.id, { schoolId: account.schoolId, gatewayTransactionId: transaction.id })
  }, { isolationLevel: "Serializable" })
  return outcome
}
