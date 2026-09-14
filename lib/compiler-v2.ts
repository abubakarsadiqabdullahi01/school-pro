import type { ResultWorkflowStatus } from "@prisma/client"
import type { PermissionKey } from "@/lib/permissions"

export type TermSubjectResult = {
  termId: string
  subjectId: string
  score: number | null
  isAbsent?: boolean
  isExempt?: boolean
  isPublished?: boolean
}

export type CumulativeSubjectResult = {
  subjectId: string
  termsCounted: number
  total: number
  average: number
  passed: boolean
}

export type CumulativeResult = {
  subjectResults: CumulativeSubjectResult[]
  totalAverage: number
  subjectsPassed: number
  subjectsCounted: number
  hasUnpublishedResults: boolean
  missingSubjectIds: string[]
}

export type FlexiblePromotionPolicy = {
  requireResultsPublished: boolean
  usePromotionCriteria: boolean
  minAverage: number | null
  minSubjectsPassed: number | null
  requiredSubjectIds: string[]
  minCoreSubjectsPassed: number | null
  requireAllSubjectsEntered: boolean
  allowManualOverride: boolean
  passMark: number
}

export type PromotionEvaluation = {
  eligible: boolean
  canOverride: boolean
  reasons: string[]
  totalAverage: number
  subjectsPassed: number
  coreSubjectsPassed: number
}

export type WorkflowTransition = {
  from: ResultWorkflowStatus
  to: ResultWorkflowStatus
  permission: PermissionKey
  noteRequired?: boolean
}

const TRANSITIONS: WorkflowTransition[] = [
  { from: "DRAFT", to: "REVIEWED", permission: "compiler.review_results" },
  { from: "REVIEWED", to: "PUBLISHED", permission: "compiler.publish_results" },
  { from: "PUBLISHED", to: "LOCKED", permission: "compiler.lock_results" },
  { from: "PUBLISHED", to: "WITHDRAWN", permission: "compiler.publish_results", noteRequired: true },
  { from: "WITHDRAWN", to: "DRAFT", permission: "compiler.review_results", noteRequired: true },
]

export function computeCumulativeResult(
  rows: readonly TermSubjectResult[],
  subjectIds: readonly string[],
  passMark: number,
): CumulativeResult {
  const subjectResults: CumulativeSubjectResult[] = []
  const missingSubjectIds: string[] = []
  let hasUnpublishedResults = false

  for (const subjectId of subjectIds) {
    const usable = rows.filter((row) => {
      if (row.subjectId !== subjectId) return false
      if (row.isPublished === false) hasUnpublishedResults = true
      return !row.isAbsent && !row.isExempt && row.score != null
    })

    if (usable.length === 0) {
      missingSubjectIds.push(subjectId)
      continue
    }

    const total = usable.reduce((sum, row) => sum + (row.score ?? 0), 0)
    const average = total / usable.length
    subjectResults.push({
      subjectId,
      termsCounted: usable.length,
      total,
      average,
      passed: average >= passMark,
    })
  }

  const subjectsPassed = subjectResults.filter((row) => row.passed).length
  const totalAverage =
    subjectResults.length > 0
      ? subjectResults.reduce((sum, row) => sum + row.average, 0) / subjectResults.length
      : 0

  return {
    subjectResults,
    totalAverage,
    subjectsPassed,
    subjectsCounted: subjectResults.length,
    hasUnpublishedResults,
    missingSubjectIds,
  }
}

export function evaluateFlexiblePromotion(
  result: CumulativeResult,
  policy: FlexiblePromotionPolicy,
): PromotionEvaluation {
  const reasons: string[] = []
  const required = new Set(policy.requiredSubjectIds)
  const coreSubjectsPassed = result.subjectResults.filter(
    (subject) => required.has(subject.subjectId) && subject.passed,
  ).length

  if (policy.requireResultsPublished && result.hasUnpublishedResults) {
    reasons.push("Some results are still unpublished")
  }

  if (policy.requireAllSubjectsEntered && result.missingSubjectIds.length > 0) {
    reasons.push(`${result.missingSubjectIds.length} required subject result(s) are missing`)
  }

  if (policy.usePromotionCriteria) {
    if (result.subjectsCounted === 0) {
      reasons.push("No scored subjects are available for promotion evaluation")
    }
    if (policy.minAverage != null && result.totalAverage < policy.minAverage) {
      reasons.push(
        `Average ${formatPercent(result.totalAverage)} is below ${formatPercent(policy.minAverage)}`,
      )
    }
    if (policy.minSubjectsPassed != null && result.subjectsPassed < policy.minSubjectsPassed) {
      reasons.push(`Passed ${result.subjectsPassed} subject(s), below ${policy.minSubjectsPassed}`)
    }
    if (policy.minCoreSubjectsPassed != null && coreSubjectsPassed < policy.minCoreSubjectsPassed) {
      reasons.push(
        `Passed ${coreSubjectsPassed} core subject(s), below ${policy.minCoreSubjectsPassed}`,
      )
    }
  }

  return {
    eligible: reasons.length === 0,
    canOverride: reasons.length > 0 && policy.allowManualOverride,
    reasons,
    totalAverage: result.totalAverage,
    subjectsPassed: result.subjectsPassed,
    coreSubjectsPassed,
  }
}

export function nextWorkflowTransition(
  from: ResultWorkflowStatus,
  to: ResultWorkflowStatus,
): WorkflowTransition | null {
  return TRANSITIONS.find((transition) => transition.from === from && transition.to === to) ?? null
}

export function assertWorkflowTransition(
  from: ResultWorkflowStatus,
  to: ResultWorkflowStatus,
  permissions: ReadonlySet<PermissionKey>,
  note?: string | null,
): void {
  const transition = nextWorkflowTransition(from, to)
  if (!transition) throw new Error(`Cannot move results from ${from} to ${to}`)
  if (!permissions.has(transition.permission)) {
    throw new Error(`Missing permission: ${transition.permission}`)
  }
  if (transition.noteRequired && !note?.trim()) {
    throw new Error("Give a reason for this result workflow change")
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}
