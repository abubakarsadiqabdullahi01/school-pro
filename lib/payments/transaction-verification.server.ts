import type { GatewayTransactionStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { decimalNairaToKobo, koboToDecimalNaira } from "./checkout-rules"
import { postVerifiedCheckoutSuccess } from "./gateway-event-processor.server"
import { adapterForPaymentConfiguration } from "./payment-settings.server"
import {
  gatewayVerificationIdentityProblems,
  gatewayVerificationProblems,
  type LocalGatewayVerification,
} from "./verification-rules"

const TERMINAL = new Set<GatewayTransactionStatus>([
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
  "DISPUTED",
  "REQUIRES_REVIEW",
])
const RECOVERABLE = ["INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING", "PROCESSING"] as const
const MAX_VERIFICATION_ATTEMPTS = 12

function retryAt(attempts: number, now = new Date()): Date {
  const seconds = Math.min(6 * 60 * 60, 60 * 2 ** Math.min(Math.max(attempts - 1, 0), 8))
  return new Date(now.getTime() + seconds * 1_000)
}

function providerLabel(provider: string): string {
  return provider.charAt(0) + provider.slice(1).toLowerCase()
}

function localVerification(transaction: {
  reference: string
  environment: "TEST" | "LIVE"
  amountExpected: Prisma.Decimal
  amountRequested: Prisma.Decimal | null
  configurationSnapshot: Prisma.JsonValue | null
  allocations: Array<{ amount: Prisma.Decimal }>
}): LocalGatewayVerification {
  const snapshot = transaction.configurationSnapshot as {
    accountMode?: unknown
    subaccountCode?: unknown
    processingFeeKobo?: unknown
    feePolicy?: unknown
  } | null
  return {
    reference: transaction.reference,
    environment: transaction.environment,
    requestedAmountKobo: decimalNairaToKobo(transaction.amountRequested ?? transaction.amountExpected),
    expectedSchoolFeesKobo: decimalNairaToKobo(transaction.amountExpected),
    allocationTotalKobo: transaction.allocations.reduce(
      (total, allocation) => total + decimalNairaToKobo(allocation.amount),
      0,
    ),
    accountMode: snapshot?.accountMode === "SCHOOL_OWNED" ? "SCHOOL_OWNED" : "PLATFORM_MANAGED",
    expectedSubaccountCode: typeof snapshot?.subaccountCode === "string" ? snapshot.subaccountCode : null,
    feePolicy: snapshot?.feePolicy === "PARENT_PAYS_GROSS_UP"
      ? "PARENT_PAYS_GROSS_UP"
      : snapshot?.feePolicy === "PLATFORM_PAYS" ? "PLATFORM_PAYS" : "SCHOOL_PAYS",
    disclosedProcessingFeeKobo: typeof snapshot?.processingFeeKobo === "number"
      ? snapshot.processingFeeKobo
      : 0,
  }
}

/**
 * Verifies one immutable checkout with its own provider and applies the result.
 *
 * This is deliberately shared by the parent callback, signed-webhook processing and the
 * recovery cron. A provider success therefore has exactly one posting path, regardless of
 * which signal reached DigiSchool first.
 */
export async function verifyGatewayTransaction(
  transactionId: string,
): Promise<GatewayTransactionStatus> {
  const transaction = await prisma.gatewayTransaction.findUnique({
    where: { id: transactionId },
    include: { allocations: { select: { amount: true } } },
  })
  if (!transaction) throw new Error("Payment attempt was not found")
  if (TERMINAL.has(transaction.status)) return transaction.status
  if (!transaction.configurationId) throw new Error("The payment connection is no longer available")

  const adapter = await adapterForPaymentConfiguration(transaction.configurationId)
  const verified = await adapter.verifyPayment(transaction.reference)
  const expected = localVerification(transaction)
  const successful = verified.status === "success"
  const problems = successful
    ? gatewayVerificationProblems(expected, verified)
    : gatewayVerificationIdentityProblems(expected, verified)
  const label = providerLabel(transaction.provider)

  // Paystack is asked outside any lock, so the webhook may have posted this payment while we
  // waited. Every write below is conditional on the status read above and on no receipt
  // existing; otherwise a parent refreshing the status page could walk a settled payment back
  // to PENDING, which blocks its refund, or into review with its receipt still standing.
  const unchanged = { id: transaction.id, status: transaction.status, paymentId: null }
  const current = async () => (await prisma.gatewayTransaction.findUniqueOrThrow({ where: { id: transaction.id }, select: { status: true } })).status

  if (problems.length > 0) {
    const flagged = await prisma.gatewayTransaction.updateMany({
      where: unchanged,
      data: {
        status: "REQUIRES_REVIEW",
        providerTransactionId: verified.providerTransactionId,
        amountCharged: koboToDecimalNaira(verified.amountKobo),
        providerFee: koboToDecimalNaira(verified.feesKobo),
        channel: verified.channel,
        verifiedAt: new Date(),
        paidAt: verified.paidAt,
        verificationClaimedAt: null,
        nextVerificationAt: null,
        lastVerificationError: null,
        failureMessage: `${label} verification did not match the immutable local checkout: ${problems.join("; ")}`,
      },
    })
    return flagged.count === 1 ? "REQUIRES_REVIEW" : current()
  }

  if (successful) {
    await postVerifiedCheckoutSuccess(transaction.id, verified, null)
    const posted = await prisma.gatewayTransaction.findUniqueOrThrow({
      where: { id: transaction.id },
      select: { status: true },
    })
    await prisma.gatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        verificationClaimedAt: null,
        nextVerificationAt: null,
        lastVerificationError: null,
      },
    })
    return posted.status
  }

  let status: GatewayTransactionStatus = "PENDING"
  if (["failed", "reversed"].includes(verified.status)) status = "FAILED"
  else if (verified.status === "abandoned") status = "ABANDONED"

  const recorded = await prisma.gatewayTransaction.updateMany({
    where: unchanged,
    data: {
      status,
      providerTransactionId: verified.providerTransactionId,
      amountCharged: koboToDecimalNaira(verified.amountKobo),
      providerFee: koboToDecimalNaira(verified.feesKobo),
      channel: verified.channel,
      verifiedAt: new Date(),
      ...(verified.paidAt ? { paidAt: verified.paidAt } : {}),
      verificationClaimedAt: null,
      nextVerificationAt: status === "PENDING" ? retryAt(transaction.verificationAttempts + 1) : null,
      lastVerificationError: null,
      ...(status === "FAILED" || status === "ABANDONED"
        ? {
            failureCode: `${transaction.provider.toLowerCase()}_${verified.status}`,
            failureMessage: `${label} reported this payment as ${verified.status}`,
          }
        : {}),
    },
  })
  return recorded.count === 1 ? status : current()
}

export type RecoverySummary = {
  checked: number
  posted: number
  pending: number
  review: number
  failed: number
  busy: number
}

/**
 * Recovers checkouts even when no webhook row exists and the parent never revisits the
 * callback page. Claims are persisted, stale claims are reclaimable, and repeated provider
 * failures back off before becoming a visible manual-review item.
 */
export async function recoverStaleGatewayTransactions(
  limit = 25,
  now = new Date(),
): Promise<RecoverySummary> {
  const bounded = Math.max(1, Math.min(limit, 100))
  const grace = new Date(now.getTime() - 2 * 60_000)
  const staleClaim = new Date(now.getTime() - 10 * 60_000)
  const candidates = await prisma.gatewayTransaction.findMany({
    where: {
      source: "CHECKOUT",
      configurationId: { not: null },
      status: { in: [...RECOVERABLE] },
      updatedAt: { lte: grace },
      OR: [{ nextVerificationAt: null }, { nextVerificationAt: { lte: now } }],
      AND: [{
        OR: [{ verificationClaimedAt: null }, { verificationClaimedAt: { lte: staleClaim } }],
      }],
    },
    orderBy: { updatedAt: "asc" },
    take: bounded,
    select: { id: true, status: true, updatedAt: true },
  })
  const summary: RecoverySummary = {
    checked: 0,
    posted: 0,
    pending: 0,
    review: 0,
    failed: 0,
    busy: 0,
  }

  for (const candidate of candidates) {
    const claimed = await prisma.gatewayTransaction.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        updatedAt: candidate.updatedAt,
        OR: [{ verificationClaimedAt: null }, { verificationClaimedAt: { lte: staleClaim } }],
      },
      data: {
        verificationClaimedAt: now,
        verificationAttempts: { increment: 1 },
      },
    })
    if (claimed.count !== 1) {
      summary.busy += 1
      continue
    }
    summary.checked += 1

    try {
      const status = await verifyGatewayTransaction(candidate.id)
      if (status === "SUCCEEDED") summary.posted += 1
      else if (status === "REQUIRES_REVIEW") summary.review += 1
      else if (status === "PENDING" || status === "PROCESSING") summary.pending += 1
      else summary.failed += 1
    } catch (error) {
      const current = await prisma.gatewayTransaction.findUnique({
        where: { id: candidate.id },
        select: { verificationAttempts: true },
      })
      const attempts = current?.verificationAttempts ?? 1
      const message = error instanceof Error ? error.message : "Provider verification failed"
      const exhausted = attempts >= MAX_VERIFICATION_ATTEMPTS
      await prisma.gatewayTransaction.updateMany({
        where: { id: candidate.id, verificationClaimedAt: now },
        data: exhausted
          ? {
              status: "REQUIRES_REVIEW",
              verificationClaimedAt: null,
              nextVerificationAt: null,
              lastVerificationError: message.slice(0, 10_000),
              failureMessage: `Automatic provider verification was parked after ${attempts} attempts. Check the provider dashboard before changing the ledger.`,
            }
          : {
              verificationClaimedAt: null,
              nextVerificationAt: retryAt(attempts, now),
              lastVerificationError: message.slice(0, 10_000),
            },
      })
      if (exhausted) summary.review += 1
      else summary.failed += 1
    }
  }
  return summary
}
