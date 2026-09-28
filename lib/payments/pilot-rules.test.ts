import { describe, expect, it } from "vitest"

import {
  liveCheckoutProblems,
  paymentHealthAlerts,
  refundDecisionProblems,
  type PaymentHealthCounts,
} from "./pilot-rules"

describe("live pilot checkout gate", () => {
  const approved = new Date("2026-09-27T00:00:00.000Z")

  it("never restricts test mode", () => {
    expect(liveCheckoutProblems({ environment: "TEST", liveApprovedAt: null, pilotMaxKobo: 100, schoolFeesKobo: 5_000_000 })).toEqual([])
  })

  it("refuses live checkout until the platform owner approves the school", () => {
    expect(liveCheckoutProblems({ environment: "LIVE", liveApprovedAt: null, pilotMaxKobo: null, schoolFeesKobo: 100 }))
      .toEqual(["Online payment is not yet approved for live use at this school"])
  })

  it("holds a piloting school to its ceiling, inclusive", () => {
    const base = { environment: "LIVE" as const, liveApprovedAt: approved, pilotMaxKobo: 1_000_000 }
    expect(liveCheckoutProblems({ ...base, schoolFeesKobo: 1_000_000 })).toEqual([])
    expect(liveCheckoutProblems({ ...base, schoolFeesKobo: 1_000_001 })[0]).toContain("₦10,000.00")
  })

  it("allows any amount once the ceiling is lifted", () => {
    expect(liveCheckoutProblems({ environment: "LIVE", liveApprovedAt: approved, pilotMaxKobo: null, schoolFeesKobo: 99_000_000 })).toEqual([])
  })
})

describe("two-person refund rule", () => {
  const waiting = { status: "REQUESTED", requestedBy: "user-a", approvedAt: null }

  it("lets a different user decide a waiting refund", () => {
    expect(refundDecisionProblems({ ...waiting, actorUserId: "user-b" })).toEqual([])
  })

  it("refuses the requester deciding their own refund", () => {
    expect(refundDecisionProblems({ ...waiting, actorUserId: "user-a" })[0]).toMatch(/someone other than/)
  })

  it("refuses a refund that was already decided or submitted", () => {
    expect(refundDecisionProblems({ ...waiting, approvedAt: new Date(), actorUserId: "user-b" })).toHaveLength(1)
    for (const status of ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "NEEDS_ATTENTION", "REJECTED"]) {
      expect(refundDecisionProblems({ ...waiting, status, actorUserId: "user-b" })).toHaveLength(1)
    }
  })
})

describe("payment health alerts", () => {
  const now = new Date("2026-09-27T12:00:00.000Z")
  const quiet: PaymentHealthCounts = {
    liveEnabled: false, stalePending: 0, requiresReview: 0, failedEvents: 0, openIssues: 0,
    refundsAwaitingApproval: 0, refundsNeedingAttention: 0, failedRefunds: 0, disputesDueSoon: 0, unappliedOpen: 0, lastReconciledAt: null,
  }

  it("is silent for a healthy test-only school", () => {
    expect(paymentHealthAlerts(quiet, now)).toEqual([])
  })

  it("puts money-affecting problems before housekeeping", () => {
    const alerts = paymentHealthAlerts({ ...quiet, failedEvents: 2, stalePending: 1, refundsAwaitingApproval: 1 }, now)
    expect(alerts.map((alert) => alert.severity)).toEqual(["critical", "warning", "warning"])
    expect(alerts[0].message).toBe("2 webhook events failed processing")
    expect(alerts[1].message).toBe("1 checkout has been pending over 30 minutes")
  })

  it("expects a live school to reconcile daily", () => {
    expect(paymentHealthAlerts({ ...quiet, liveEnabled: true }, now)).toEqual([
      { severity: "warning", message: "Settlements have never been reconciled" },
    ])
    expect(paymentHealthAlerts({ ...quiet, liveEnabled: true, lastReconciledAt: new Date("2026-09-27T00:00:00.000Z") }, now)).toEqual([])
    expect(paymentHealthAlerts({ ...quiet, liveEnabled: true, lastReconciledAt: new Date("2026-09-26T08:00:00.000Z") }, now)[0].message)
      .toBe("Settlements have not been reconciled for 28 hours")
  })
})
