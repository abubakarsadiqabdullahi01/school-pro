import { Prisma, type GatewayEventStatus, type GatewayTransactionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  LedgerAllocationConflictError,
  postStudentPaymentInTransaction,
  reverseStudentPaymentInTransaction,
} from "@/lib/finance/payment-ledger.server"
import { decimalNairaToKobo, koboToDecimalNaira } from "./checkout-rules"
import {
  assertGatewayTransactionTransition,
  canTransitionGatewayTransaction,
} from "./gateway-state"
import { processDedicatedTransferEvent } from "./dedicated-transfer.server"
import { processIdentificationEvent } from "./dedicated-accounts.server"
import { adapterForPaymentConfiguration } from "./payment-settings.server"
import {
  queuePaymentReceiptInTransaction,
  queueRefundNoticeInTransaction,
} from "@/lib/notifications/payment-receipt.server"
import type { VerifiedGatewayPayment } from "./contracts"
import { disputeOutcome, isDisputeResolution, type DisputeOutcome } from "./dispute-rules"
import {
  gatewayVerificationIdentityProblems,
  gatewayVerificationProblems,
  type LocalGatewayVerification,
} from "./verification-rules"

type ProcessResult = "processed" | "ignored" | "already_processed" | "busy" | "failed"

/**
 * How many times an event is retried before it is parked.
 *
 * With the backoff below this spans about 17 hours (1, 2, 4 ... minutes, then 256 minutes each),
 * which covers any outage worth riding out. Past that the failure is not transient, and an event that keeps retrying for
 * ever is an event nobody is looking at — it needs to become visibly stuck instead.
 */
export const MAX_EVENT_ATTEMPTS = 12

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

function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

/**
 * Records a problem the ledger cannot settle on its own where the school and the monitor
 * already look: the reconciliation exceptions. Idempotent per transaction and kind.
 */
async function raiseGatewayIssue(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; gatewayTransactionId: string; kind: string; message: string; detail?: Prisma.InputJsonValue },
) {
  const dedupeKey = `${input.schoolId}:${input.gatewayTransactionId}:${input.kind}`.slice(0, 191)
  await tx.gatewayReconciliationIssue.upsert({
    where: { dedupeKey },
    create: { schoolId: input.schoolId, gatewayTransactionId: input.gatewayTransactionId, dedupeKey, kind: input.kind,
      severity: "ERROR", message: input.message, detail: input.detail },
    update: { status: "OPEN", lastSeenAt: new Date(), resolvedAt: null, message: input.message },
  })
}

/** Paystack's refund outcomes are final: once processed, or failed, only "processed" may follow. */
function refundStatusMayChange(current: string, next: string): boolean {
  if (current === "PROCESSED") return false
  if (current === "FAILED") return next === "PROCESSED"
  return true
}

async function processRefundEvent(event: NonNullable<Awaited<ReturnType<typeof prisma.gatewayEvent.findUnique>>>) {
  const data = eventData(event.payload)
  const providerRefundId = textValue(data.id)
  const amountKobo = typeof data.amount === "number" && Number.isSafeInteger(data.amount) ? data.amount : null
  // A transaction can carry two refunds at once (the receipted part and the held part), so
  // the provider's refund id decides. Without a match on it, only a refund Paystack has not
  // yet given an id to can be this one, and only on the same amount when the event says.
  // Taking "the latest in flight" once marked held money returned on the strength of a
  // refund of the receipt.
  let refund = providerRefundId
    ? await prisma.gatewayRefund.findFirst({ where: { provider: event.provider, environment: event.environment, providerRefundId } })
    : null
  if (!refund && event.gatewayTransactionId) {
    const candidates = await prisma.gatewayRefund.findMany({
      where: { provider: event.provider, environment: event.environment, gatewayTransactionId: event.gatewayTransactionId,
        approvedAt: { not: null }, providerRefundId: null, status: { in: ["REQUESTED", "PENDING", "PROCESSING", "NEEDS_ATTENTION"] } },
    })
    const matching = amountKobo === null ? candidates : candidates.filter((candidate) => decimalNairaToKobo(candidate.amount) === amountKobo)
    // Retried with backoff: by then the approval will have saved Paystack's refund id.
    if (matching.length > 1) throw new Error("More than one refund on this transaction could be this one; waiting for Paystack's refund id")
    refund = matching[0] ?? null
  }
  if (!refund) {
    await finishEvent(event.id, "IGNORED", "No local refund request matched this provider event")
    return "ignored" as const
  }
  const status = event.eventType === "refund.processed" ? "PROCESSED"
    : event.eventType === "refund.failed" ? "FAILED"
      : event.eventType === "refund.needs-attention" ? "NEEDS_ATTENTION"
        : event.eventType === "refund.processing" ? "PROCESSING" : "PENDING"

  await applyRefundOutcome({
    refundId: refund.id, status, providerRefundId, failureReason: textValue(data.reason), reference: event.reference, eventId: event.id,
  })
  return "processed" as const
}

export type RefundOutcomeStatus = "PENDING" | "PROCESSING" | "NEEDS_ATTENTION" | "PROCESSED" | "FAILED"

/**
 * Applies what Paystack says happened to one refund: the status, and when it was processed
 * the ledger's side of it - held money closed as returned, or the receipt reversed and the
 * family told. Shared by the refund webhook and by asking Paystack directly, so there is
 * one place a refund can move money in the books. With `eventId`, that webhook event is
 * marked done in the same transaction.
 */
export async function applyRefundOutcome(input: {
  refundId: string
  status: RefundOutcomeStatus
  providerRefundId: string | null
  failureReason?: string | null
  reference?: string | null
  eventId?: string
}): Promise<"applied" | "unchanged"> {
  const { status, providerRefundId } = input
  let outcome: "applied" | "unchanged" = "applied"
  const finishEventInTx = async (tx: Prisma.TransactionClient, lastError: string | null) => {
    if (!input.eventId) return
    await tx.gatewayEvent.update({ where: { id: input.eventId }, data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError } })
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.gatewayRefund.findUniqueOrThrow({ where: { id: input.refundId } })
    // A late or replayed event (a parked one retried by hand, say) never walks a finished
    // refund back: a processed refund shown as pending invites someone to pay it again.
    if (!refundStatusMayChange(current.status, status)) {
      outcome = "unchanged"
      await finishEventInTx(tx, `Arrived after the refund was already ${current.status.toLowerCase()}; nothing changed`)
      return
    }
    if (status === "PROCESSED" && current.status !== "PROCESSED") {
      if (current.unappliedPaymentId) {
        // Held money never reached a receipt, so there is nothing to reverse: the held row
        // simply records that it went back to the payer. Only while it is still held: money
        // applied or returned meanwhile has gone twice, and a person must untangle that.
        const returned = await tx.unappliedPayment.updateMany({
          where: { id: current.unappliedPaymentId, status: "OPEN" },
          data: { status: "RETURNED", resolvedBy: current.approvedBy ?? current.requestedBy, resolvedAt: new Date(),
            resolutionNote: `Refunded through Paystack (${providerRefundId ?? current.providerRefundId ?? input.reference ?? "refund"})` },
        })
        if (returned.count !== 1) {
          await raiseGatewayIssue(tx, {
            schoolId: current.schoolId, gatewayTransactionId: current.gatewayTransactionId, kind: "HELD_REFUND_AFTER_RESOLUTION",
            message: "Paystack refunded held transfer money that had already been applied to fees or returned. The payer may "
              + "have been paid twice, or fees may show as paid with money that has gone back. Check it and correct it by hand.",
            detail: { refundId: current.id, unappliedPaymentId: current.unappliedPaymentId },
          })
        }
      } else if (current.paymentId) {
        await reverseStudentPaymentInTransaction(tx, {
          schoolId: current.schoolId, paymentId: current.paymentId,
          reason: current.reason, referenceNo: providerRefundId ?? current.providerRefundId ?? input.reference ?? null,
          createdBy: current.requestedBy,
        })
        // A family whose fees reopen finds out from the school, not from a balance that
        // moved on its own. Counter refunds already notify; this is the same notice.
        await queueRefundNoticeInTransaction(tx, {
          schoolId: current.schoolId, paymentId: current.paymentId, reason: current.reason,
        })
        const transaction = await tx.gatewayTransaction.findUniqueOrThrow({ where: { id: current.gatewayTransactionId }, select: { status: true } })
        if (canTransitionGatewayTransaction(transaction.status, "REFUNDED")) {
          await tx.gatewayTransaction.update({ where: { id: current.gatewayTransactionId }, data: { status: "REFUNDED" } })
        }
      }
    }
    await tx.gatewayRefund.update({
      where: { id: current.id },
      data: { status, providerRefundId: providerRefundId ?? current.providerRefundId,
        processedAt: status === "PROCESSED" ? new Date() : current.processedAt,
        failedAt: status === "FAILED" ? new Date() : null,
        providerMessage: status === "FAILED" ? input.failureReason ?? "Provider reported refund failure"
          : status === "NEEDS_ATTENTION" ? "Paystack needs the payer's bank account to complete this refund" : null,
        // Asked again for an account: the one sent before did not work, so it is entered afresh.
        ...(status === "NEEDS_ATTENTION" && current.status !== "NEEDS_ATTENTION"
          ? { payoutAccountNumber: null, payoutBankId: null, payoutBankName: null, payoutAccountName: null,
              payoutEnteredBy: null, payoutEnteredAt: null, payoutConfirmedBy: null }
          : {}) },
    })
    await finishEventInTx(tx, null)
  }, { isolationLevel: "Serializable" })
  return outcome
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
  // A create or remind that arrives after the dispute closed (late, or a parked event retried
  // by hand) must not reopen it: that left a settled transaction DISPUTED for good.
  const existing = await prisma.gatewayDispute.findUnique({
    where: { provider_environment_providerDisputeId: { provider: event.provider, environment: event.environment, providerDisputeId } },
    select: { resolvedAt: true },
  })
  if (existing?.resolvedAt && !isDisputeResolution(event.eventType)) {
    await finishEvent(event.id, "PROCESSED", "Arrived after the dispute had closed; nothing changed")
    return "processed" as const
  }
  // Only a settled transaction becomes DISPUTED. One held for review, or already refunded,
  // keeps its status: a dispute declined later would otherwise mark a quarantined transfer
  // SUCCEEDED with no receipt behind it. The dispute row itself records the dispute.
  const disputedTransaction = event.gatewayTransactionId && !isDisputeResolution(event.eventType)
    ? await prisma.gatewayTransaction.findUnique({ where: { id: event.gatewayTransactionId }, select: { status: true } })
    : null
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
    ...(event.gatewayTransactionId && disputedTransaction?.status === "SUCCEEDED"
      ? [prisma.gatewayTransaction.updateMany({ where: { id: event.gatewayTransactionId, status: "SUCCEEDED" }, data: { status: "DISPUTED" } })] : []),
    prisma.gatewayEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), nextAttemptAt: null, lastError: null } }),
  ])

  // A dispute that closes has to land somewhere. Left at DISPUTED, a payment the payer won
  // still reads as settled fees the school no longer holds the money for, and the debt
  // vanishes from the debtors report with nothing to show it was ever owed.
  if (event.gatewayTransactionId && isDisputeResolution(event.eventType)) {
    await settleResolvedDispute(event.gatewayTransactionId, disputeOutcome({
      status,
      resolution: textValue(data.resolution),
    }), amountKobo)
  }
  return "processed" as const
}

/**
 * Put a transaction back where a closed dispute leaves it.
 *
 * Only a payer-refunded outcome touches the ledger, and it reuses the ordinary reversal so
 * the charge reopens, the balance returns and the receipt is marked exactly as a refund at
 * the counter would be. There is no second way to un-settle a fee.
 *
 * A dedicated-account transfer can have part of it held, or applied to fees later through
 * a receipt of its own. A chargeback takes the whole transfer back, so the held part closes
 * as returned and a receipt made from it is reversed too; without that, the school could
 * apply or return money the payer already had back. A partial chargeback cannot be spread
 * over those pieces by rule, so it goes to a person instead.
 */
async function settleResolvedDispute(
  gatewayTransactionId: string,
  outcome: DisputeOutcome,
  disputedAmountKobo: number | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Held money first, then the transfer: the order every held-money action locks them in.
    const [heldRow] = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM UnappliedPayment WHERE gatewayTransactionId = ${gatewayTransactionId} FOR UPDATE`,
    )
    await tx.$queryRaw(Prisma.sql`SELECT id FROM GatewayTransaction WHERE id = ${gatewayTransactionId} FOR UPDATE`)
    const locked = await tx.gatewayTransaction.findUniqueOrThrow({
      where: { id: gatewayTransactionId },
      select: { id: true, status: true, schoolId: true, paymentId: true, amountCharged: true, amountExpected: true },
    })

    if (outcome === "SCHOOL_KEEPS") {
      // Only a transaction this dispute made DISPUTED goes back to SUCCEEDED.
      if (locked.status !== "DISPUTED") return
      await tx.gatewayTransaction.update({
        where: { id: locked.id },
        data: { status: "SUCCEEDED", failureCode: null, failureMessage: null },
      })
      return
    }

    if (outcome === "PAYER_REFUNDED") {
      const transferredKobo = decimalNairaToKobo(locked.amountCharged ?? locked.amountExpected)
      if (disputedAmountKobo !== null && disputedAmountKobo < transferredKobo) {
        await sendDisputeToReview(tx, locked,
          `The payer won a chargeback of ${formatKobo(disputedAmountKobo)} of the ${formatKobo(transferredKobo)} paid. `
            + "Nothing was reversed automatically: decide which fees reopen, then correct them by hand.")
        return
      }
      if (heldRow) {
        const held = await tx.unappliedPayment.findUniqueOrThrow({
          where: { id: heldRow.id },
          include: { refund: true, appliedPayment: { select: { id: true, receiptNo: true, status: true } } },
        })
        const reason = "Chargeback upheld by Paystack; the payer has been refunded"
        if (held.status === "APPLIED" && held.appliedPayment?.status === "COMPLETED") {
          await reverseStudentPaymentInTransaction(tx, {
            schoolId: locked.schoolId, paymentId: held.appliedPayment.id, reason, referenceNo: null, createdBy: null,
          })
          await queueRefundNoticeInTransaction(tx, { schoolId: locked.schoolId, paymentId: held.appliedPayment.id, reason })
        }
        if (held.status === "OPEN" || held.status === "APPLIED") {
          await tx.unappliedPayment.update({
            where: { id: held.id },
            data: {
              status: "RETURNED", resolvedBy: null, resolvedAt: new Date(),
              resolutionNote: held.appliedPayment
                ? `Charged back by the payer's bank; receipt ${held.appliedPayment.receiptNo} reversed`
                : "Charged back by the payer's bank",
            },
          })
        }
        // Money that was also going back another way may now have gone twice.
        const alsoGoing = held.status === "RETURNED" ? "had already been returned to the payer"
          : held.returnRequestedBy ? "had a return outside Paystack recorded against it"
            : held.refund && !["REJECTED", "FAILED"].includes(held.refund.status) ? "had a Paystack refund in progress"
              : null
        if (alsoGoing) {
          await raiseGatewayIssue(tx, {
            schoolId: locked.schoolId, gatewayTransactionId: locked.id, kind: "CHARGEBACK_ON_RETURNED_MONEY",
            message: `The payer charged back a transfer whose held money ${alsoGoing}. They may have been paid twice; check and recover it by hand.`,
            detail: { unappliedPaymentId: held.id },
          })
        }
      }
      if (locked.paymentId) {
        const reason = "Chargeback upheld by Paystack; the payer has been refunded"
        await reverseStudentPaymentInTransaction(tx, {
          schoolId: locked.schoolId,
          paymentId: locked.paymentId,
          reason,
          referenceNo: null,
          createdBy: null,
        })
        await queueRefundNoticeInTransaction(tx, {
          schoolId: locked.schoolId, paymentId: locked.paymentId, reason,
        })
      }
      if (!canTransitionGatewayTransaction(locked.status, "REFUNDED")) return
      await tx.gatewayTransaction.update({
        where: { id: locked.id },
        data: { status: "REFUNDED", failureMessage: "Dispute resolved in the payer's favour; fees reopened" },
      })
      return
    }

    // Resolved in a way this code does not recognise. Money may or may not have moved, so
    // nothing is assumed and the transaction is put in front of a person.
    await sendDisputeToReview(tx, locked, "Paystack closed this dispute with a resolution this system does not "
      + "recognise. Check the dispute on Paystack and decide whether the fees stay settled.")
  }, { isolationLevel: "Serializable" })
}

/**
 * Puts a disputed transaction in front of a person. A settled one gets there as it would
 * through its dispute: Paystack can send the resolution without the event that opened it,
 * and refusing the move then dropped a partial chargeback without a word. Anything that
 * cannot be put in review (already refunded, say) is raised as an exception instead.
 */
async function sendDisputeToReview(
  tx: Prisma.TransactionClient,
  locked: { id: string; status: GatewayTransactionStatus; schoolId: string },
  message: string,
) {
  const reviewable = canTransitionGatewayTransaction(locked.status, "REQUIRES_REVIEW")
    || (canTransitionGatewayTransaction(locked.status, "DISPUTED") && canTransitionGatewayTransaction("DISPUTED", "REQUIRES_REVIEW"))
  if (reviewable && locked.status !== "REFUNDED") {
    await tx.gatewayTransaction.update({ where: { id: locked.id }, data: { status: "REQUIRES_REVIEW", failureMessage: message } })
    return
  }
  await raiseGatewayIssue(tx, { schoolId: locked.schoolId, gatewayTransactionId: locked.id, kind: "DISPUTE_NEEDS_REVIEW", message })
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
    // A dedicated-account transfer is recorded in full the first time it is processed:
    // applied, held for review, or quarantined. A later delivery of the same transfer with
    // different bytes escapes the payload-hash dedupe and is linked to that record by its
    // reference. It must not reach the checkout verifier below, which can never match a
    // transfer and would overwrite a correctly held transfer with REQUIRES_REVIEW - inviting
    // a manual receipt that credits the student twice.
    if (transaction?.source === "DEDICATED_ACCOUNT") {
      await finishEvent(event.id, "PROCESSED")
      return "already_processed"
    }
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
    // `event.attempts` was incremented when this run claimed the event, so it counts this
    // attempt. Parking sets no next attempt and uses a status the claim query does not
    // match, so the event stops rather than coming straight back round.
    const exhausted = event.attempts >= MAX_EVENT_ATTEMPTS
    await prisma.gatewayEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? "DEAD" : "FAILED",
        claimedAt: null,
        nextAttemptAt: exhausted ? null : retryAt(event.attempts),
        lastError: exhausted
          ? `Parked after ${event.attempts} attempts. Last error: ${message}`.slice(0, 10_000)
          : message.slice(0, 10_000),
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
/**
 * Park a verified success that cannot be posted, instead of retrying it.
 *
 * The money is real and Paystack has confirmed it; what failed is the local decision about
 * where it belongs, and no number of retries changes that. Closing the event and handing a
 * person the transaction with the reason written on it is the only honest outcome — a
 * payment that retries every minute for ever is a payment nobody is looking at.
 */
async function quarantineVerifiedSuccess(
  tx: Prisma.TransactionClient,
  transactionId: string,
  currentStatus: GatewayTransactionStatus,
  verified: VerifiedGatewayPayment,
  eventId: string | null,
  reason: string,
): Promise<void> {
  assertGatewayTransactionTransition(currentStatus, "REQUIRES_REVIEW")
  await tx.gatewayTransaction.update({
    where: { id: transactionId },
    data: {
      status: "REQUIRES_REVIEW",
      providerTransactionId: verified.providerTransactionId,
      amountCharged: koboToDecimalNaira(verified.amountKobo),
      providerFee: koboToDecimalNaira(verified.feesKobo),
      channel: verified.channel,
      verifiedAt: new Date(),
      paidAt: verified.paidAt ?? new Date(),
      failureMessage: reason,
    },
  })
  if (eventId) await tx.gatewayEvent.update({
    where: { id: eventId },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      nextAttemptAt: null,
      lastError: `Quarantined: ${reason}`,
    },
  })
}

export async function postVerifiedCheckoutSuccess(
  transactionId: string,
  verified: VerifiedGatewayPayment,
  eventId: string | null,
): Promise<void> {
  try {
    await postVerifiedCheckoutSuccessInTransaction(transactionId, verified, eventId)
  } catch (error) {
    if (!(error instanceof LedgerAllocationConflictError)) throw error

    // The fees this payment was raised against have been settled by something else since
    // checkout opened — in practice, the office taking cash at the counter while the parent
    // was on Paystack. The posting transaction has rolled back, so nothing is half-written;
    // what remains is a confirmed payment with nowhere to go.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM GatewayTransaction WHERE id = ${transactionId} FOR UPDATE`)
      const locked = await tx.gatewayTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        select: { id: true, status: true, paymentId: true },
      })
      // A racing worker may have posted it in the meantime; that is a success, not a review.
      if (locked.paymentId) return
      await quarantineVerifiedSuccess(tx, locked.id, locked.status, verified, eventId,
        "Paystack confirmed this payment, but the fees it was raised against have since been "
        + "settled by another payment — most often one taken at the school counter. Nothing has "
        + "been posted to the ledger. Refund the payer or hold the amount as credit.")
    }, { isolationLevel: "Serializable" })
  }
}

async function postVerifiedCheckoutSuccessInTransaction(
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
      await quarantineVerifiedSuccess(tx, locked.id, locked.status, verified, eventId,
        `Verified Paystack success conflicts with terminal local status ${locked.status}`)
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
