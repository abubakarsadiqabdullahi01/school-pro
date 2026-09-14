/**
 * Whether a student may be promoted at the end of a term.
 *
 * Kept pure — no database, no session — because this is the rule that decides whether a
 * child repeats a year, and it should be exhaustively testable without a fixture.
 *
 * Two independent switches, so a school turns on whichever it actually wants:
 *
 *  - **requireResultsPublished** — refuse to promote out of a term whose results are not
 *    finished and released. Stops a class being moved up before anyone has seen the marks.
 *  - **usePromotionCriteria** — refuse to promote a student who missed the academic bar,
 *    by average, by subjects passed, or both.
 *
 * With both off, every active student is eligible, which is the behaviour the module had
 * before any policy existed. That default matters: turning the feature on must be a choice,
 * not something that silently changes how an existing school works.
 */

export type PromotionPolicy = {
  requireResultsPublished: boolean
  usePromotionCriteria: boolean
  /** Minimum overall average, out of 100. Null means the average is not tested. */
  minAverage: number | null
  /** Minimum number of subjects at or above the grading system's pass mark. */
  minSubjectsPassed: number | null
  /** TERM evaluates one term; SESSION_AVERAGE evaluates all available terms in a session. */
  evaluationScope: "TERM" | "SESSION_AVERAGE"
  /** Subject ids a school treats as required/core for promotion. */
  requiredSubjectIds: string[]
  /** Minimum number of required/core subjects that must be passed. */
  minCoreSubjectsPassed: number | null
  /** Refuse promotion when an offered subject has no usable result row. */
  requireAllSubjectsEntered: boolean
  /** Whether an authorised admin may deliberately override a failed policy verdict. */
  allowManualOverride: boolean
}

export type StudentResultSummary = {
  studentId: string
  name: string
  /** Subjects with a usable score — absent and exempt entries are already excluded. */
  subjectCount: number
  averageScore: number
  passedSubjects: number
  /** True when any result for this student in the term is still unpublished. */
  hasUnpublishedResults: boolean
}

export type EligibilityVerdict = {
  studentId: string
  name: string
  eligible: boolean
  /** Every reason, not just the first — an admin fixing this wants the whole picture. */
  reasons: string[]
  averageScore: number
  passedSubjects: number
}

/** One decimal place, so "58.3%" rather than "58.33333333333333%". */
function pct(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}

export function evaluatePromotionEligibility(
  student: StudentResultSummary,
  policy: PromotionPolicy,
): EligibilityVerdict {
  const reasons: string[] = []

  if (policy.requireResultsPublished) {
    if (student.subjectCount === 0) {
      reasons.push("No results recorded for this term")
    } else if (student.hasUnpublishedResults) {
      reasons.push("Results for this term have not been published")
    }
  }

  if (policy.usePromotionCriteria) {
    // Without any results there is nothing to measure against, and passing somebody on an
    // average of zero would be worse than saying so.
    if (student.subjectCount === 0) {
      if (!reasons.includes("No results recorded for this term")) {
        reasons.push("No results recorded to assess against the promotion criteria")
      }
    } else {
      if (policy.minAverage != null && student.averageScore < policy.minAverage) {
        reasons.push(
          `Average ${pct(student.averageScore)} is below the required ${pct(policy.minAverage)}`,
        )
      }
      if (policy.minSubjectsPassed != null && student.passedSubjects < policy.minSubjectsPassed) {
        reasons.push(
          `Passed ${student.passedSubjects} subject${student.passedSubjects === 1 ? "" : "s"}, ` +
            `below the required ${policy.minSubjectsPassed}`,
        )
      }
    }
  }

  return {
    studentId: student.studentId,
    name: student.name,
    eligible: reasons.length === 0,
    reasons,
    averageScore: student.averageScore,
    passedSubjects: student.passedSubjects,
  }
}

/** Splits a class into those who may go up and those who may not. */
export function splitByEligibility(
  students: StudentResultSummary[],
  policy: PromotionPolicy,
): { eligible: EligibilityVerdict[]; ineligible: EligibilityVerdict[] } {
  const verdicts = students.map((student) => evaluatePromotionEligibility(student, policy))
  return {
    eligible: verdicts.filter((verdict) => verdict.eligible),
    ineligible: verdicts.filter((verdict) => !verdict.eligible),
  }
}

/** The policy a school has before anybody configures one: both rules off. */
export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  requireResultsPublished: false,
  usePromotionCriteria: false,
  minAverage: null,
  minSubjectsPassed: null,
  evaluationScope: "TERM",
  requiredSubjectIds: [],
  minCoreSubjectsPassed: null,
  requireAllSubjectsEntered: false,
  allowManualOverride: true,
}
