"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { decimalNairaToKobo } from "@/lib/payments/checkout-rules"
import { adapterForPaymentConfiguration } from "@/lib/payments/payment-settings.server"
import { refundDecisionProblems } from "@/lib/payments/pilot-rules"
import { RECONCILIATION_AUDIT_ACTION, reconcileSchoolSettlements, type ReconciliationSummary } from "@/lib/payments/reconciliation.server"

type Result<T> = { success: true; data: T } | { success: false; error: string }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

async function manager() {
  const actor = await requirePermission("finance.manage_gateway")
  if (!actor.schoolId) throw new Error("Select a school before managing online payments")
  return { actor, schoolId: actor.schoolId }
}

/** Records a request for one full provider refund. Nothing is sent to Paystack here: under
 * the two-person rule a different user with `finance.approve_refunds` must approve it first. */
export async function requestGatewayRefund(input: unknown): Promise<Result<{ refundId: string; status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ transactionId: z.string().uuid(), reason: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    const transaction = await prisma.gatewayTransaction.findFirst({
      where: { id: data.transactionId, schoolId },
      include: { payment: true, refunds: true },
    })
    if (!transaction?.payment || transaction.status !== "SUCCEEDED" || transaction.payment.status !== "COMPLETED") {
      throw new Error("Only a succeeded online payment with a completed receipt can be refunded")
    }
    if (!transaction.configurationId) throw new Error("The payment configuration is no longer available")
    // Refunds of held money are separate; this is the one refund of the receipted amount.
    const existing = transaction.refunds.find((refund) => !refund.unappliedPaymentId)
    if (existing && existing.status !== "REJECTED") throw new Error("A refund already exists for this transaction")

    // One refund row per transaction; a rejected request is reopened rather than duplicated,
    // and its history stays in the audit log.
    const fields = { status: "REQUESTED" as const, amount: transaction.payment.amount, reason: data.reason, requestedBy: actor.userId,
      approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null, providerMessage: null }
    const refund = existing
      ? await prisma.gatewayRefund.update({ where: { id: existing.id }, data: fields })
      : await prisma.gatewayRefund.create({
          data: { ...fields, schoolId, gatewayTransactionId: transaction.id, paymentId: transaction.payment.id,
            environment: transaction.environment, currency: transaction.currency },
        })
    await recordAudit({ actor, action: "payment_gateway.refund_request", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Requested a full refund for ${transaction.reference}, waiting for approval`, after: { transactionId: transaction.id, amount: transaction.payment.amount.toFixed(2), reason: data.reason } })
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
    const held = await prisma.unappliedPayment.findFirst({
      where: { id: data.unappliedId, schoolId, status: "OPEN" },
      include: { gatewayTransaction: true, refund: true },
    })
    if (!held) throw new Error("Open unapplied money not found")
    if (!held.gatewayTransaction.configurationId) throw new Error("The payment configuration is no longer available")
    if (held.refund && held.refund.status !== "REJECTED") throw new Error("A refund of this money has already been requested")

    const fields = { status: "REQUESTED" as const, amount: held.amount, reason: data.reason, requestedBy: actor.userId,
      approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null, providerMessage: null }
    const refund = held.refund
      ? await prisma.gatewayRefund.update({ where: { id: held.refund.id }, data: fields })
      : await prisma.gatewayRefund.create({
          data: { ...fields, schoolId, gatewayTransactionId: held.gatewayTransactionId, unappliedPaymentId: held.id,
            environment: held.gatewayTransaction.environment, currency: held.gatewayTransaction.currency },
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

/**
 * Paystack cannot always refund a bank-transfer payment on its own; it marks the refund
 * needs-attention until it is told which account to pay. This supplies that account.
 */
export async function provideRefundBankDetails(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    if (!actor.schoolId) throw new Error("Select a school before managing refunds")
    const data = z.object({
      refundId: z.string().uuid(),
      accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
      bankId: z.string().regex(/^\d+$/, "Choose the payer's bank"),
      confirmation: z.literal(true),
    }).parse(input)
    const refund = await prisma.gatewayRefund.findFirst({
      where: { id: data.refundId, schoolId: actor.schoolId },
      include: { gatewayTransaction: { select: { configurationId: true, reference: true } } },
    })
    if (!refund) throw new Error("Refund was not found")
    if (refund.status !== "NEEDS_ATTENTION" || !refund.providerRefundId) {
      throw new Error("Only a refund Paystack has marked as needing the payer's bank account can take account details")
    }
    if (!refund.gatewayTransaction.configurationId) throw new Error("The payment configuration is no longer available")
    await (await adapterForPaymentConfiguration(refund.gatewayTransaction.configurationId))
      .retryRefundWithCustomerDetails(refund.providerRefundId, data.accountNumber, data.bankId)
    await prisma.gatewayRefund.update({ where: { id: refund.id }, data: { status: "PENDING", providerMessage: null } })
    await recordAudit({ actor, action: "payment_gateway.refund_account_details", entityType: "GatewayRefund", entityId: refund.id,
      summary: `Sent the payer's bank account to Paystack for the refund of ${refund.gatewayTransaction.reference}`,
      after: { accountLast4: data.accountNumber.slice(-4), bankId: data.bankId } })
    refreshRefundViews(refund.gatewayTransactionId)
    return { success: true, data: { status: "PENDING" } }
  } catch (error) {
    return { success: false, error: message(error, "Could not send the bank details to Paystack") }
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
    if (!transaction.configurationId) throw new Error("The payment configuration is no longer available")

    // Claim the approval atomically so two approvers can never both submit the refund.
    const claimed = await prisma.gatewayRefund.updateMany({
      where: { id: refund.id, status: "REQUESTED", approvedAt: null },
      data: { approvedBy: actor.userId, approvedAt: new Date() },
    })
    if (claimed.count !== 1) throw new Error("This refund was already decided by someone else")

    let status: "PENDING" | "PROCESSING" | "NEEDS_ATTENTION" = "PENDING"
    try {
      const provider = await (await adapterForPaymentConfiguration(transaction.configurationId))
        .createRefund(transaction.reference, decimalNairaToKobo(refund.amount), refund.reason)
      status = provider.status === "processing" ? "PROCESSING" : provider.status === "needs-attention" ? "NEEDS_ATTENTION" : "PENDING"
      await prisma.gatewayRefund.update({
        where: { id: refund.id },
        data: { providerRefundId: provider.providerRefundId, status, expectedAt: provider.expectedAt, providerMessage: null },
      })
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

export async function resolveGatewayDispute(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const { actor, schoolId } = await manager()
    const data = z.object({ disputeId: z.string().uuid(), resolution: z.enum(["merchant-accepted", "declined"]),
      message: z.string().trim().min(5).max(500), refundAmountKobo: z.number().int().nonnegative(), confirmation: z.literal(true) }).parse(input)
    const { dispute, adapter } = await disputeAdapter(schoolId, data.disputeId)
    await adapter.resolveDispute(dispute.providerDisputeId, data.resolution, data.message, data.refundAmountKobo)
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
    return { success: true as const, data: {
      refunds: refunds.map((x) => ({ ...x, amount: x.amount.toFixed(2), createdAt: x.createdAt.toISOString(), processedAt: x.processedAt?.toISOString() ?? null })),
      disputes: disputes.map((x) => ({ ...x, amount: x.amount?.toFixed(2) ?? null, dueAt: x.dueAt?.toISOString() ?? null, lastEventAt: x.lastEventAt.toISOString() })),
      settlements: settlements.map((x) => ({ ...x, totalAmount: x.totalAmount.toFixed(2), totalFees: x.totalFees.toFixed(2), totalProcessed: x.totalProcessed.toFixed(2), settlementDate: x.settlementDate?.toISOString() ?? null })),
      issues: issues.map((x) => ({ ...x, firstSeenAt: x.firstSeenAt.toISOString(), lastSeenAt: x.lastSeenAt.toISOString() })),
    } }
  } catch (error) { return { success: false as const, error: message(error, "Could not load gateway operations") } }
}
