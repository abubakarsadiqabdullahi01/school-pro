"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { decimalNairaToKobo } from "@/lib/payments/checkout-rules"
import { heldTransferProblem } from "@/lib/payments/dedicated-account-rules"
import { lockHeldMoney } from "@/lib/payments/dedicated-accounts.server"
import { adapterForPaymentConfiguration } from "@/lib/payments/payment-settings.server"
import { refundPayoutViews } from "@/lib/payments/refund-payout.server"
import { refundDecisionProblems } from "@/lib/payments/pilot-rules"
import { RECONCILIATION_AUDIT_ACTION, reconcileSchoolSettlements, type ReconciliationSummary } from "@/lib/payments/reconciliation.server"

type Result<T> = { success: true; data: T } | { success: false; error: string }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

async function manager() {
  const actor = await requirePermission("finance.manage_gateway")
  if (!actor.schoolId) throw new Error("Select a school before managing online payments")
  return { actor, schoolId: actor.schoolId }
}

/** A refund that ended without money moving may be asked for again, on the same row. */
const REOPENABLE_REFUND = new Set(["REJECTED", "FAILED"])

/** Everything about a previous attempt is cleared; its history is in the audit log. */
function reopenedRefund(amount: Prisma.Decimal, reason: string, requestedBy: string) {
  return {
    status: "REQUESTED" as const, amount, reason, requestedBy,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null, providerMessage: null,
    providerRefundId: null, expectedAt: null, processedAt: null, failedAt: null,
    payoutAccountNumber: null, payoutBankId: null, payoutBankName: null, payoutAccountName: null,
    payoutEnteredBy: null, payoutEnteredAt: null, payoutConfirmedBy: null,
  }
}

/** Records a request for one full provider refund. Nothing is sent to Paystack here: under
 * the two-person rule a different user with `finance.approve_refunds` must approve it first. */
export async function requestGatewayRefund(input: unknown): Promise<Result<{ refundId: string; status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ transactionId: z.string().uuid(), reason: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    // Locked, so two requests at the same moment cannot both find "no refund yet" and create
    // two: each could then be approved, and Paystack would refund the payer twice.
    const { transaction, refund } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM GatewayTransaction WHERE id = ${data.transactionId} AND schoolId = ${schoolId} FOR UPDATE`)
      const transaction = await tx.gatewayTransaction.findFirst({
        where: { id: data.transactionId, schoolId },
        include: { payment: true, refunds: true },
      })
      if (!transaction?.payment || transaction.status !== "SUCCEEDED" || transaction.payment.status !== "COMPLETED") {
        throw new Error("Only a succeeded online payment with a completed receipt can be refunded")
      }
      if (!transaction.configurationId) throw new Error("The payment configuration is no longer available")
      // Refunds of held money are separate; this is the one refund of the receipted amount.
      const existing = transaction.refunds.find((refund) => !refund.unappliedPaymentId)
      if (existing && !REOPENABLE_REFUND.has(existing.status)) throw new Error("A refund already exists for this transaction")

      // One refund row per transaction; a rejected or failed request is reopened rather than
      // duplicated, and its history stays in the audit log.
      const refund = existing
        ? await tx.gatewayRefund.update({ where: { id: existing.id }, data: reopenedRefund(transaction.payment.amount, data.reason, actor.userId) })
        : await tx.gatewayRefund.create({
            data: { ...reopenedRefund(transaction.payment.amount, data.reason, actor.userId), schoolId, gatewayTransactionId: transaction.id,
              paymentId: transaction.payment.id, environment: transaction.environment, currency: transaction.currency },
          })
      return { transaction, refund }
    })
    await recordAudit({ actor, action: "payment_gateway.refund_request", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Requested a full refund for ${transaction.reference}, waiting for approval`, after: { transactionId: transaction.id, amount: refund.amount.toFixed(2), reason: data.reason } })
    refreshRefundViews(transaction.id)
    return { success: true, data: { refundId: refund.id, status: "REQUESTED" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not request provider refund") }
  }
}

/** Asks to send held dedicated-account money back to the payer through Paystack. Same
 * two-person rule as any refund; the held row closes only when Paystack confirms. */
export async function requestUnappliedRefund(input: unknown): Promise<Result<{ refundId: string; status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ unappliedId: z.string().uuid(), reason: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    // Locked as `requestUnappliedReturn` locks it, so a refund and a return outside Paystack
    // requested at the same moment are serialized and the second one sees the first.
    const { held, refund } = await prisma.$transaction(async (tx) => {
      await lockHeldMoney(tx, data.unappliedId, schoolId)
      const held = await tx.unappliedPayment.findFirst({
        where: { id: data.unappliedId, schoolId, status: "OPEN" },
        include: { gatewayTransaction: true, refund: true },
      })
      if (!held) throw new Error("Open unapplied money not found")
      if (held.returnRequestedBy) throw new Error("A return of this money outside Paystack is waiting for confirmation; withdraw it first")
      if (!held.gatewayTransaction.configurationId) throw new Error("The payment configuration is no longer available")
      if (held.refund && !REOPENABLE_REFUND.has(held.refund.status)) throw new Error("A refund of this money has already been requested")

      const fields = reopenedRefund(held.amount, data.reason, actor.userId)
      const refund = held.refund
        ? await tx.gatewayRefund.update({ where: { id: held.refund.id }, data: fields })
        : await tx.gatewayRefund.create({
            data: { ...fields, schoolId, gatewayTransactionId: held.gatewayTransactionId, unappliedPaymentId: held.id,
              environment: held.gatewayTransaction.environment, currency: held.gatewayTransaction.currency },
          })
      return { held, refund }
    })
    await recordAudit({ actor, action: "payment_gateway.refund_request", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Requested a refund of held money from ${held.gatewayTransaction.reference}, waiting for approval`,
      after: { unappliedId: held.id, amount: held.amount.toFixed(2), reason: data.reason } })
    refreshRefundViews(held.gatewayTransactionId)
    return { success: true, data: { refundId: refund.id, status: "REQUESTED" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not request the refund") }
  }
}

async function refundNeedingAccount(refundId: string, schoolId: string) {
  const refund = await prisma.gatewayRefund.findFirst({
    where: { id: refundId, schoolId },
    include: { gatewayTransaction: { select: { configurationId: true, reference: true } } },
  })
  if (!refund) throw new Error("Refund was not found")
  if (refund.status !== "NEEDS_ATTENTION" || !refund.providerRefundId) {
    throw new Error("Only a refund Paystack has marked as needing the payer's bank account can take account details")
  }
  if (!refund.gatewayTransaction.configurationId) throw new Error("The payment configuration is no longer available")
  return { refund, providerRefundId: refund.providerRefundId, configurationId: refund.gatewayTransaction.configurationId }
}

/**
 * Paystack cannot always refund a bank-transfer payment on its own; it marks the refund
 * needs-attention until it is told which account to pay. Choosing that account decides
 * where the money goes, so it takes two people, as approving the refund did: one approver
 * enters the account here (Paystack names its holder, to compare with the payer), and a
 * different approver confirms it with `confirmRefundBankDetails`. Nothing is sent before.
 */
export async function provideRefundBankDetails(input: unknown): Promise<Result<{ status: string; accountName: string }>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    if (!actor.schoolId) throw new Error("Select a school before managing refunds")
    const data = z.object({
      refundId: z.string().uuid(),
      accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
      bankId: z.string().regex(/^\d+$/, "Choose the payer's bank"),
      bankCode: z.string().trim().min(1).max(20),
      confirmation: z.literal(true),
    }).parse(input)
    const { refund, configurationId } = await refundNeedingAccount(data.refundId, actor.schoolId)
    if (refund.payoutEnteredBy) throw new Error("An account is already waiting for a second person to confirm it; withdraw it first")
    const adapter = await adapterForPaymentConfiguration(configurationId)
    const bank = (await adapter.listBanks()).find((candidate) => candidate.code === data.bankCode && String(candidate.id) === data.bankId)
    if (!bank) throw new Error("Choose the payer's bank from the list")
    const resolved = await adapter.resolveBankAccount(data.accountNumber, data.bankCode)
    const entered = await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "NEEDS_ATTENTION", payoutEnteredBy: null },
      data: { payoutAccountNumber: data.accountNumber, payoutBankId: data.bankId, payoutBankName: bank.name.slice(0, 120),
        payoutAccountName: resolved.accountName.slice(0, 191), payoutEnteredBy: actor.userId, payoutEnteredAt: new Date(), payoutConfirmedBy: null },
    })
    if (entered.count !== 1) throw new Error("This refund changed while you were entering the account. Refresh and try again.")
    await recordAudit({ actor, action: "payment_gateway.refund_account_enter", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Entered ${resolved.accountName}'s account for the refund of ${refund.gatewayTransaction.reference}, awaiting a second person`,
      after: { accountLast4: data.accountNumber.slice(-4), bank: bank.name, accountName: resolved.accountName } })
    refreshRefundViews(refund.gatewayTransactionId)
    return { success: true, data: { status: "AWAITING_CONFIRMATION", accountName: resolved.accountName } }
  } catch (error) {
    return { success: false, error: message(error, "Could not record the bank details") }
  }
}

/**
 * The second approver's confirmation, pinned to the entry they were shown. Only now does the
 * account go to Paystack; afterwards the number is kept masked.
 */
export async function confirmRefundBankDetails(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    if (!actor.schoolId) throw new Error("Select a school before managing refunds")
    const data = z.object({ refundId: z.string().uuid(), enteredAt: z.string().datetime(), confirmation: z.literal(true) }).parse(input)
    const { refund, providerRefundId, configurationId } = await refundNeedingAccount(data.refundId, actor.schoolId)
    if (!refund.payoutEnteredBy || !refund.payoutEnteredAt || !refund.payoutAccountNumber || !refund.payoutBankId) {
      throw new Error("No account is waiting to be confirmed for this refund")
    }
    if (refund.payoutEnteredBy === actor.userId) throw new Error("A different person must confirm an account you entered")
    if (refund.payoutEnteredAt.toISOString() !== new Date(data.enteredAt).toISOString()) {
      throw new Error("The account was changed after you opened it. Refresh, check it again, then confirm.")
    }
    const claimed = await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "NEEDS_ATTENTION", payoutEnteredAt: refund.payoutEnteredAt, payoutConfirmedBy: null },
      data: { payoutConfirmedBy: actor.userId },
    })
    if (claimed.count !== 1) throw new Error("This account was already confirmed or changed by someone else")
    try {
      await (await adapterForPaymentConfiguration(configurationId))
        .retryRefundWithCustomerDetails(providerRefundId, refund.payoutAccountNumber, refund.payoutBankId)
    } catch (error) {
      // Released so it can be confirmed again; Paystack refuses details for a refund that no
      // longer needs them, so a send that did land cannot be repeated into a second payment.
      await prisma.gatewayRefund.updateMany({ where: { id: refund.id, payoutConfirmedBy: actor.userId }, data: { payoutConfirmedBy: null } })
      throw error
    }
    await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "NEEDS_ATTENTION" },
      data: { status: "PENDING", providerMessage: null, payoutAccountNumber: `******${refund.payoutAccountNumber.slice(-4)}` },
    })
    await recordAudit({ actor, action: "payment_gateway.refund_account_details", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Confirmed and sent ${refund.payoutAccountName ?? "the payer"}'s account to Paystack for the refund of ${refund.gatewayTransaction.reference}`,
      after: { accountLast4: refund.payoutAccountNumber.slice(-4), bank: refund.payoutBankName, enteredBy: refund.payoutEnteredBy } })
    refreshRefundViews(refund.gatewayTransactionId)
    return { success: true, data: { status: "PENDING" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not send the bank details to Paystack") }
  }
}

/** Takes back an account that has not been confirmed, so a correct one can be entered. */
export async function withdrawRefundBankDetails(input: unknown): Promise<Result<undefined>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    if (!actor.schoolId) throw new Error("Select a school before managing refunds")
    const data = z.object({ refundId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const cleared = await prisma.gatewayRefund.updateMany({
      where: { id: data.refundId, schoolId: actor.schoolId, status: "NEEDS_ATTENTION", payoutEnteredBy: { not: null }, payoutConfirmedBy: null },
      data: { payoutAccountNumber: null, payoutBankId: null, payoutBankName: null, payoutAccountName: null, payoutEnteredBy: null, payoutEnteredAt: null },
    })
    if (cleared.count !== 1) throw new Error("No unconfirmed account is waiting on this refund")
    await recordAudit({ actor, action: "payment_gateway.refund_account_withdraw", entityType: "GatewayRefund", entityId: data.refundId,
      summary: "Withdrew an unconfirmed refund account" })
    const refund = await prisma.gatewayRefund.findUnique({ where: { id: data.refundId }, select: { gatewayTransactionId: true } })
    if (refund) refreshRefundViews(refund.gatewayTransactionId)
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not withdraw the account") }
  }
}

async function refundApprover(refundId: string) {
  const actor = await requirePermission("finance.approve_refunds")
  if (!actor.schoolId) throw new Error("Select a school before approving refunds")
  const refund = await prisma.gatewayRefund.findFirst({
    where: { id: refundId, schoolId: actor.schoolId },
    include: { gatewayTransaction: true, payment: true, unappliedPayment: true },
  })
  if (!refund) throw new Error("Refund was not found")
  const problem = refundDecisionProblems({ status: refund.status, requestedBy: refund.requestedBy, approvedAt: refund.approvedAt, actorUserId: actor.userId })[0]
  if (problem) throw new Error(problem)
  return { actor, refund }
}

/** The second person's approval. Only now is the refund submitted to Paystack; the receipt
 * stays completed until refund.processed is received and verified. */
export async function approveGatewayRefund(input: unknown): Promise<Result<{ refundId: string; status: string }>> {
  try {
    const data = z.object({ refundId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const { actor, refund } = await refundApprover(data.refundId)
    const transaction = refund.gatewayTransaction
    const stillRefundable = refund.unappliedPayment
      ? refund.unappliedPayment.status === "OPEN"
      : transaction.status === "SUCCEEDED" && refund.payment?.status === "COMPLETED"
    if (!stillRefundable) throw new Error("This payment can no longer be refunded; reject the request instead")
    // Both request paths refuse while the other is live, under a lock; this is the last line.
    // Sending the refund while a return outside Paystack waits could pay the payer twice.
    if (refund.unappliedPayment?.returnRequestedBy) {
      throw new Error("A return of this money outside Paystack is waiting for confirmation; reject this refund or withdraw that return first")
    }
    const transferProblem = refund.unappliedPayment ? heldTransferProblem(transaction.status) : null
    if (transferProblem) throw new Error(transferProblem)
    if (!transaction.configurationId) throw new Error("The payment configuration is no longer available")

    // Claim the approval atomically so two approvers can never both submit the refund.
    // The requester is re-checked here too: the request could have been rejected and asked
    // for again by this same person since the check above.
    const claimed = await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "REQUESTED", approvedAt: null, requestedBy: { not: actor.userId } },
      data: { approvedBy: actor.userId, approvedAt: new Date() },
    })
    if (claimed.count !== 1) throw new Error("This refund was already decided by someone else")

    let status: "PENDING" | "PROCESSING" | "NEEDS_ATTENTION" = "PENDING"
    try {
      const provider = await (await adapterForPaymentConfiguration(transaction.configurationId))
        .createRefund(transaction.reference, decimalNairaToKobo(refund.amount), refund.reason)
      status = provider.status === "processing" ? "PROCESSING" : provider.status === "needs-attention" ? "NEEDS_ATTENTION" : "PENDING"
      // A webhook may have got here first and already moved the refund on (even to
      // processed); then only Paystack's id is filled in, never the status walked back.
      const saved = await prisma.gatewayRefund.updateMany({
        where: { id: refund.id, status: "REQUESTED" },
        data: { providerRefundId: provider.providerRefundId, status, expectedAt: provider.expectedAt, providerMessage: null },
      })
      if (saved.count !== 1) {
        await prisma.gatewayRefund.updateMany({ where: { id: refund.id, providerRefundId: null }, data: { providerRefundId: provider.providerRefundId } })
      }
    } catch (error) {
      // A lost response can mean Paystack accepted the write. Never automatically submit it again.
      await prisma.gatewayRefund.update({ where: { id: refund.id }, data: { status: "NEEDS_ATTENTION", providerMessage: message(error, "Provider response was uncertain") } })
      await recordAudit({ actor, action: "payment_gateway.refund_approve", entityType: "GatewayRefund", entityId: refund.id,
        summary: `Approved the refund for ${transaction.reference}; the provider outcome is uncertain`, after: { status: "NEEDS_ATTENTION" } })
      refreshRefundViews(transaction.id)
      throw new Error("Refund outcome is uncertain. Do not retry; reconcile it in Paystack and wait for the webhook.")
    }
    await recordAudit({ actor, action: "payment_gateway.refund_approve", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Approved and submitted the full refund for ${transaction.reference}`,
      after: { requestedBy: refund.requestedBy, amount: refund.amount.toFixed(2), status } })
    refreshRefundViews(transaction.id)
    return { success: true, data: { refundId: refund.id, status } }
  } catch (error) {
    return { success: false, error: message(error, "Could not approve the refund") }
  }
}

export async function rejectGatewayRefund(input: unknown): Promise<Result<{ refundId: string; status: string }>> {
  try {
    const data = z.object({ refundId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(input)
    const { actor, refund } = await refundApprover(data.refundId)
    const changed = await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "REQUESTED", approvedAt: null },
      data: { status: "REJECTED", rejectedBy: actor.userId, rejectedAt: new Date(), rejectionReason: data.reason },
    })
    if (changed.count !== 1) throw new Error("This refund was already decided by someone else")
    await recordAudit({ actor, action: "payment_gateway.refund_reject", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Rejected the refund request for ${refund.gatewayTransaction.reference}`, after: { reason: data.reason } })
    refreshRefundViews(refund.gatewayTransactionId)
    return { success: true, data: { refundId: refund.id, status: "REJECTED" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not reject the refund") }
  }
}

function refreshRefundViews(transactionId: string) {
  revalidatePath(`/dashboard/admin/finance/online-payments/${transactionId}`)
  revalidatePath(`/dashboard/accountant/online-payments/${transactionId}`)
  revalidatePath("/dashboard/admin/finance/online-payments/reconciliation")
  revalidatePath("/dashboard/accountant/online-payments/reconciliation")
}

export async function runGatewayReconciliation(): Promise<Result<ReconciliationSummary>> {
  try {
    const { actor, schoolId } = await manager()
    const { settlements, transactions, issues } = await reconcileSchoolSettlements(schoolId)
    await recordAudit({ actor, action: RECONCILIATION_AUDIT_ACTION, entityType: "School", entityId: schoolId,
      summary: `Reconciled ${settlements} settlements and found ${issues} exceptions`, after: { settlements, transactions, issues } })
    revalidatePath("/dashboard/admin/finance/online-payments/reconciliation")
    revalidatePath("/dashboard/accountant/online-payments/reconciliation")
    return { success: true, data: { settlements, transactions, issues } }
  } catch (error) {
    return { success: false, error: message(error, "Could not reconcile provider settlements") }
  }
}

async function disputeAdapter(schoolId: string, disputeId: string) {
  const dispute = await prisma.gatewayDispute.findFirst({ where: { id: disputeId, schoolId }, include: { gatewayTransaction: true } })
  if (!dispute) throw new Error("Dispute was not found")
  const configurationId = dispute.gatewayTransaction?.configurationId ?? (await prisma.schoolPaymentConfiguration.findFirst({
    where: { schoolId, environment: dispute.environment, isEnabled: true, status: "READY" }, select: { id: true },
  }))?.id
  if (!configurationId) throw new Error("No active payment configuration can manage this dispute")
  return { dispute, adapter: await adapterForPaymentConfiguration(configurationId) }
}

export async function submitGatewayDisputeEvidence(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ disputeId: z.string().uuid(), customerEmail: z.string().email(), customerName: z.string().trim().min(2).max(191),
      customerPhone: z.string().trim().min(7).max(30), serviceDetails: z.string().trim().min(10).max(2000),
      deliveryAddress: z.string().trim().max(500).optional(), deliveryDate: z.string().optional() }).parse(input)
    const { dispute, adapter } = await disputeAdapter(schoolId, data.disputeId)
    await adapter.submitDisputeEvidence(dispute.providerDisputeId, data)
    await prisma.gatewayDispute.update({ where: { id: dispute.id }, data: { evidenceNote: data.serviceDetails } })
    await recordAudit({ actor, action: "payment_gateway.dispute_evidence", entityType: "GatewayDispute", entityId: dispute.id,
      summary: `Submitted evidence for dispute ${dispute.providerDisputeId}`, after: { customerEmail: data.customerEmail, serviceDetails: data.serviceDetails } })
    revalidatePath("/dashboard/admin/finance/online-payments/reconciliation"); revalidatePath("/dashboard/accountant/online-payments/reconciliation")
    return { success: true, data: { status: "submitted" } }
  } catch (error) { return { success: false, error: message(error, "Could not submit dispute evidence") } }
}

/**
 * Contests a dispute. Accepting one sends money back to the payer, and a single person
 * could do that here, so acceptance is done in the Paystack dashboard under Paystack's own
 * team controls; the resolution webhook then reverses the fees here as usual.
 */
export async function resolveGatewayDispute(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ disputeId: z.string().uuid(), resolution: z.literal("declined"),
      message: z.string().trim().min(5).max(500), confirmation: z.literal(true) }).parse(input)
    const { dispute, adapter } = await disputeAdapter(schoolId, data.disputeId)
    await adapter.resolveDispute(dispute.providerDisputeId, data.resolution, data.message, 0)
    await prisma.gatewayDispute.update({ where: { id: dispute.id }, data: { resolution: data.resolution, status: "resolution-submitted" } })
    await recordAudit({ actor, action: "payment_gateway.dispute_resolution", entityType: "GatewayDispute", entityId: dispute.id,
      summary: `Submitted ${data.resolution} for dispute ${dispute.providerDisputeId}`, after: data })
    revalidatePath("/dashboard/admin/finance/online-payments/reconciliation"); revalidatePath("/dashboard/accountant/online-payments/reconciliation")
    return { success: true, data: { status: "resolution-submitted" } }
  } catch (error) { return { success: false, error: message(error, "Could not resolve dispute") } }
}

export async function getGatewayOperations() {
  try {
    const actor = await requirePermission("finance.view_reports")
    if (!actor.schoolId) throw new Error("Select a school")
    const [refunds, disputes, settlements, issues] = await Promise.all([
      prisma.gatewayRefund.findMany({ where: { schoolId: actor.schoolId }, orderBy: { createdAt: "desc" }, take: 100,
        include: { gatewayTransaction: { select: { reference: true } }, payment: { select: { receiptNo: true } } } }),
      prisma.gatewayDispute.findMany({ where: { schoolId: actor.schoolId }, orderBy: { lastEventAt: "desc" }, take: 100 }),
      prisma.gatewaySettlement.findMany({ where: { schoolId: actor.schoolId }, orderBy: { settlementDate: "desc" }, take: 100 }),
      prisma.gatewayReconciliationIssue.findMany({ where: { schoolId: actor.schoolId, status: { not: "RESOLVED" } }, orderBy: { lastSeenAt: "desc" }, take: 100 }),
    ])
    const payouts = await refundPayoutViews(refunds)
    return { success: true as const, data: {
      refunds: refunds.map(({ payoutAccountNumber: _number, payoutAccountName: _name, payoutBankName: _bank, payoutEnteredBy: _by, payoutEnteredAt: _at, payoutConfirmedBy: _confirmed, ...x }) => ({
        ...x, amount: x.amount.toFixed(2), createdAt: x.createdAt.toISOString(), processedAt: x.processedAt?.toISOString() ?? null,
        payout: payouts.get(x.id) ?? null,
      })),
      disputes: disputes.map((x) => ({ ...x, amount: x.amount?.toFixed(2) ?? null, dueAt: x.dueAt?.toISOString() ?? null, lastEventAt: x.lastEventAt.toISOString() })),
      settlements: settlements.map((x) => ({ ...x, totalAmount: x.totalAmount.toFixed(2), totalFees: x.totalFees.toFixed(2), totalProcessed: x.totalProcessed.toFixed(2), settlementDate: x.settlementDate?.toISOString() ?? null })),
      issues: issues.map((x) => ({ ...x, firstSeenAt: x.firstSeenAt.toISOString(), lastSeenAt: x.lastSeenAt.toISOString() })),
    } }
  } catch (error) { return { success: false as const, error: message(error, "Could not load gateway operations") } }
}
