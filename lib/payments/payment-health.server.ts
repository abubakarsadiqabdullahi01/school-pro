import type { PaymentGatewayEnvironment } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  DISPUTE_WARNING_DAYS,
  STALE_PENDING_MINUTES,
  paymentHealthAlerts,
  type PaymentHealthAlert,
  type PaymentHealthCounts,
} from "./pilot-rules"
import { RECONCILIATION_AUDIT_ACTION } from "./reconciliation.server"

export type SchoolPaymentHealth = {
  schoolId: string
  schoolName: string
  schoolCode: string
  connections: Array<{
    configurationId: string
    environment: "TEST" | "LIVE"
    accountMode: string
    status: string
    isEnabled: boolean
    liveApprovedAt: string | null
    pilotMaxAmount: string | null
  }>
  counts: PaymentHealthCounts
  /** Confirmed LIVE money over the last seven days — the pilot's actual volume. */
  liveLastSevenDays: { count: number; amount: string }
  alerts: PaymentHealthAlert[]
}

const WAITING_STATUSES = ["INITIALIZED", "INITIALIZATION_UNKNOWN", "PENDING", "PROCESSING"] as const

function countBySchool(rows: Array<{ schoolId: string | null; _count: { _all: number } }>) {
  const map = new Map<string, number>()
  for (const row of rows) if (row.schoolId) map.set(row.schoolId, (map.get(row.schoolId) ?? 0) + row._count._all)
  return map
}

/**
 * One row per school that has started online payment setup, with the counts the pilot
 * monitor needs. A handful of grouped queries rather than a query per school, so the page
 * stays quick as schools are added.
 */
export async function collectPaymentHealth(now: Date = new Date()): Promise<{
  schools: SchoolPaymentHealth[]
  /** Webhook events that failed before a school could be identified. */
  unattributedFailedEvents: number
}> {
  const staleBefore = new Date(now.getTime() - STALE_PENDING_MINUTES * 60_000)
  const disputeHorizon = new Date(now.getTime() + DISPUTE_WARNING_DAYS * 86_400_000)
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)

  const [configurations, stale, review, failedEvents, unattributed, issues, refunds, disputes, reconciliations, live, unapplied] = await Promise.all([
    prisma.schoolPaymentConfiguration.findMany({
      orderBy: [{ school: { name: "asc" } }, { environment: "asc" }],
      select: {
        id: true, schoolId: true, environment: true, accountMode: true, status: true, isEnabled: true,
        liveApprovedAt: true, pilotMaxAmount: true, school: { select: { name: true, code: true } },
      },
    }),
    prisma.gatewayTransaction.groupBy({
      by: ["schoolId"], _count: { _all: true },
      where: { status: { in: [...WAITING_STATUSES] }, createdAt: { lt: staleBefore } },
    }),
    prisma.gatewayTransaction.groupBy({ by: ["schoolId"], _count: { _all: true }, where: { status: "REQUIRES_REVIEW" } }),
    prisma.gatewayEvent.groupBy({ by: ["schoolId"], _count: { _all: true }, where: { status: "FAILED", schoolId: { not: null } } }),
    prisma.gatewayEvent.count({ where: { status: "FAILED", schoolId: null } }),
    prisma.gatewayReconciliationIssue.groupBy({ by: ["schoolId"], _count: { _all: true }, where: { status: "OPEN" } }),
    prisma.gatewayRefund.groupBy({
      by: ["schoolId", "status"], _count: { _all: true },
      where: { status: { in: ["REQUESTED", "NEEDS_ATTENTION", "FAILED"] } },
    }),
    prisma.gatewayDispute.groupBy({
      by: ["schoolId"], _count: { _all: true },
      where: { resolvedAt: null, dueAt: { not: null, lte: disputeHorizon } },
    }),
    prisma.auditLog.groupBy({
      by: ["schoolId"], _max: { createdAt: true },
      where: { action: RECONCILIATION_AUDIT_ACTION, schoolId: { not: null } },
    }),
    prisma.gatewayTransaction.groupBy({
      by: ["schoolId"], _count: { _all: true }, _sum: { amountExpected: true },
      where: { environment: "LIVE", status: { in: ["SUCCEEDED", "REFUNDED", "DISPUTED"] }, paidAt: { gte: weekAgo } },
    }),
    prisma.unappliedPayment.groupBy({ by: ["schoolId"], _count: { _all: true }, where: { status: "OPEN" } }),
  ])

  const staleBySchool = countBySchool(stale)
  const reviewBySchool = countBySchool(review)
  const failedBySchool = countBySchool(failedEvents)
  const issuesBySchool = countBySchool(issues)
  const disputesBySchool = countBySchool(disputes)
  const unappliedBySchool = countBySchool(unapplied)
  const lastReconciled = new Map(reconciliations.map((row) => [row.schoolId, row._max.createdAt]))
  const liveBySchool = new Map(live.map((row) => [row.schoolId, row]))
  const refundCount = (schoolId: string, status: string) =>
    refunds.filter((row) => row.schoolId === schoolId && row.status === status).reduce((sum, row) => sum + row._count._all, 0)

  const bySchool = new Map<string, SchoolPaymentHealth>()
  for (const configuration of configurations) {
    let row = bySchool.get(configuration.schoolId)
    if (!row) {
      const liveRow = liveBySchool.get(configuration.schoolId)
      row = {
        schoolId: configuration.schoolId,
        schoolName: configuration.school.name,
        schoolCode: configuration.school.code,
        connections: [],
        counts: {
          liveEnabled: false,
          stalePending: staleBySchool.get(configuration.schoolId) ?? 0,
          requiresReview: reviewBySchool.get(configuration.schoolId) ?? 0,
          failedEvents: failedBySchool.get(configuration.schoolId) ?? 0,
          openIssues: issuesBySchool.get(configuration.schoolId) ?? 0,
          refundsAwaitingApproval: refundCount(configuration.schoolId, "REQUESTED"),
          refundsNeedingAttention: refundCount(configuration.schoolId, "NEEDS_ATTENTION"),
          failedRefunds: refundCount(configuration.schoolId, "FAILED"),
          disputesDueSoon: disputesBySchool.get(configuration.schoolId) ?? 0,
          unappliedOpen: unappliedBySchool.get(configuration.schoolId) ?? 0,
          lastReconciledAt: lastReconciled.get(configuration.schoolId) ?? null,
        },
        liveLastSevenDays: {
          count: liveRow?._count._all ?? 0,
          amount: (liveRow?._sum.amountExpected?.toFixed(2)) ?? "0.00",
        },
        alerts: [],
      }
      bySchool.set(configuration.schoolId, row)
    }
    row.connections.push({
      configurationId: configuration.id,
      environment: configuration.environment as PaymentGatewayEnvironment,
      accountMode: configuration.accountMode,
      status: configuration.status,
      isEnabled: configuration.isEnabled,
      liveApprovedAt: configuration.liveApprovedAt?.toISOString() ?? null,
      pilotMaxAmount: configuration.pilotMaxAmount?.toFixed(2) ?? null,
    })
    if (configuration.environment === "LIVE" && configuration.isEnabled) row.counts.liveEnabled = true
  }

  const schools = [...bySchool.values()]
  for (const school of schools) school.alerts = paymentHealthAlerts(school.counts, now)
  return { schools, unattributedFailedEvents: unattributed }
}
