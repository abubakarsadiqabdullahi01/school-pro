/**
 * Slice 8 — the live pilot.
 *
 * Three rules sit between a verified Paystack connection and real money:
 *  - LIVE checkout needs the platform owner's approval for that school, not just the
 *    school's own switch, and a piloting school can be held to a per-checkout ceiling;
 *  - a refund leaves DigiSchool-Pro only after a second person approves it;
 *  - the monitor turns raw counts into the few alerts someone must act on.
 *
 * Everything here is pure so the rules can be proved without a database or a provider.
 */

export type LiveCheckoutInput = {
  environment: "TEST" | "LIVE"
  liveApprovedAt: Date | null
  /** The pilot ceiling in kobo, or null for no ceiling. */
  pilotMaxKobo: number | null
  schoolFeesKobo: number
}

export function liveCheckoutProblems(input: LiveCheckoutInput): string[] {
  if (input.environment !== "LIVE") return []
  if (!input.liveApprovedAt) {
    return ["Online payment is not yet approved for live use at this school"]
  }
  if (input.pilotMaxKobo !== null && input.schoolFeesKobo > input.pilotMaxKobo) {
    return [
      `During the pilot, one online payment is limited to ₦${(input.pilotMaxKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}. Pay a smaller amount or pay at the bursary.`,
    ]
  }
  return []
}

export type RefundDecisionInput = {
  status: string
  requestedBy: string
  approvedAt: Date | null
  actorUserId: string
}

export function refundDecisionProblems(input: RefundDecisionInput): string[] {
  if (input.status !== "REQUESTED" || input.approvedAt) {
    return ["Only a refund waiting for approval can be approved or rejected"]
  }
  if (input.requestedBy === input.actorUserId) {
    return ["A refund must be approved or rejected by someone other than the person who requested it"]
  }
  return []
}

export type PaymentHealthCounts = {
  liveEnabled: boolean
  /** Checkouts still waiting on the provider after the stale threshold. */
  stalePending: number
  requiresReview: number
  failedEvents: number
  openIssues: number
  refundsAwaitingApproval: number
  refundsNeedingAttention: number
  failedRefunds: number
  disputesDueSoon: number
  /** Dedicated-account money held for a bursar decision (Slice 9). */
  unappliedOpen: number
  /** When settlements were last reconciled, or null if never. */
  lastReconciledAt: Date | null
}

export type PaymentHealthAlert = {
  severity: "critical" | "warning"
  message: string
}

/** How long a checkout can wait on Paystack before someone should look at it. */
export const STALE_PENDING_MINUTES = 30
/** A live school should reconcile daily; allow a little slack for the cron. */
export const RECONCILIATION_MAX_AGE_HOURS = 26
/** A dispute due within this many days is flagged. */
export const DISPUTE_WARNING_DAYS = 3

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

export function paymentHealthAlerts(counts: PaymentHealthCounts, now: Date = new Date()): PaymentHealthAlert[] {
  const alerts: PaymentHealthAlert[] = []

  if (counts.failedEvents > 0) {
    alerts.push({ severity: "critical", message: `${plural(counts.failedEvents, "webhook event", "webhook events")} failed processing` })
  }
  if (counts.requiresReview > 0) {
    alerts.push({ severity: "critical", message: `${plural(counts.requiresReview, "payment needs", "payments need")} review` })
  }
  if (counts.openIssues > 0) {
    alerts.push({ severity: "critical", message: `${plural(counts.openIssues, "reconciliation exception is", "reconciliation exceptions are")} open` })
  }
  if (counts.refundsNeedingAttention + counts.failedRefunds > 0) {
    alerts.push({ severity: "critical", message: `${plural(counts.refundsNeedingAttention + counts.failedRefunds, "refund has", "refunds have")} failed or an uncertain outcome` })
  }
  if (counts.disputesDueSoon > 0) {
    alerts.push({ severity: "critical", message: `${plural(counts.disputesDueSoon, "dispute is", "disputes are")} due within ${DISPUTE_WARNING_DAYS} days` })
  }
  if (counts.stalePending > 0) {
    alerts.push({ severity: "warning", message: `${plural(counts.stalePending, "checkout has", "checkouts have")} been pending over ${STALE_PENDING_MINUTES} minutes` })
  }
  if (counts.refundsAwaitingApproval > 0) {
    alerts.push({ severity: "warning", message: `${plural(counts.refundsAwaitingApproval, "refund is", "refunds are")} waiting for approval` })
  }
  if (counts.unappliedOpen > 0) {
    alerts.push({ severity: "warning", message: `${plural(counts.unappliedOpen, "transfer is", "transfers are")} held as unapplied money` })
  }
  if (counts.liveEnabled) {
    const ageHours = counts.lastReconciledAt
      ? (now.getTime() - counts.lastReconciledAt.getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY
    if (ageHours > RECONCILIATION_MAX_AGE_HOURS) {
      alerts.push({
        severity: "warning",
        message: counts.lastReconciledAt
          ? `Settlements have not been reconciled for ${Math.floor(ageHours)} hours`
          : "Settlements have never been reconciled",
      })
    }
  }

  return alerts
}
