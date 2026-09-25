/**
 * Whether a student may be promoted at the end of a term or a session.
 *
 * Kept pure — no database, no session — because this is the rule that decides whether a
 * child repeats a year, and it should be exhaustively testable without a fixture.
 *
 * Two independent switches, so a school turns on whichever it actually wants:
 *
 *  - **requireResultsPublished** — refuse to promote out of a term whose results are not
 *    finished and released. Stops a class being moved up before anyone has seen the marks.
 *  - **usePromotionCriteria** — refuse to promote a student who missed the academic bar,
 *    by average, by subjects passed, by credits earned, or by any combination.
 *
 * With both off, every active student is eligible, which is the behaviour the module had
 * before any policy existed. That default matters: turning the feature on must be a choice,
 * not something that silently changes how an existing school works.
 *
 * Policy *resolution* — school default versus per-class override — lives in
 * `lib/promotion-policy.ts`, along with the annual decision this feeds.
 */

export type PromotionPolicy = {
  requireResultsPublished: boolean
  usePromotionCriteria: boolean
  /** Minimum overall average, out of 100. Null means the average is not tested. */
  minAverage: number | null
  /** Minimum number of subjects at or above the grading system's pass mark. */
  minSubjectsPassed: number | null
  /**
   * Minimum number of subjects at or above `creditMark`. Null means credits are not counted.
   *
   * Deliberately separate from `minSubjectsPassed`. A pass is measured against the school's
   * grading pass mark, which defaults to 40; a credit is the higher bar Nigerian schools
   * actually promote on. A subject scored 45 is a pass and is not a credit, and a rule that
   * conflated the two would quietly promote learners the school meant to hold back.
   */
  minCreditsRequired: number | null
  /** The score a subject must reach to count as a credit. 50 is WAEC's C6 boundary. */
  creditMark: number
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
  /**
   * A final year. Its learners graduate rather than being promoted.
   *
   * This changes the *label* on a successful outcome, not the bar: a finalist who misses
   * the criteria still repeats. A school that wants every finalist out regardless turns
   * `usePromotionCriteria` off for the class.
   */
  isGraduatingClass: boolean
}

/** One subject's outcome for a student, over whatever period the policy evaluates. */
export type SubjectOutcome = {
  subjectId: string
  /** At or above the grading system's pass mark. */
  passed: boolean
  /** The score itself, so credits can be counted without a second pass over the data. */
  score: number
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
  /** Offered/required subjects with no complete usable score. */
  missingSubjectIds?: string[]
  /** Per-subject outcome, used by the core-subject and credit rules. */
  subjectResults?: SubjectOutcome[]
}

export type EligibilityVerdict = {
  studentId: string
  name: string
  eligible: boolean
  /** Every reason, not just the first — an admin fixing this wants the whole picture. */
  reasons: string[]
  averageScore: number
  passedSubjects: number
  /** Subjects at or above the policy's credit mark. */
  creditsEarned: number
}

/** One decimal place, so "58.3%" rather than "58.33333333333333%". */
function pct(value: number): string {
  return `${Math.round(value * 10) / 10}%`
}

/**
 * Subjects scored at or above `creditMark`.
 *
 * Returns 0 rather than throwing when per-subject detail was not supplied: a caller that
 * does not collect scores cannot be counting credits either, and the credit rule below is
 * skipped in that case rather than failing everyone on a count of zero.
 */
export function countCredits(
  subjectResults: readonly SubjectOutcome[] | undefined,
  creditMark: number,
): number {
  if (!subjectResults) return 0
  return subjectResults.filter((subject) => subject.score >= creditMark).length
}

export function evaluatePromotionEligibility(
  student: StudentResultSummary,
  policy: PromotionPolicy,
): EligibilityVerdict {
  const reasons: string[] = []
  const creditsEarned = countCredits(student.subjectResults, policy.creditMark)

  if (policy.requireResultsPublished) {
    if (student.subjectCount === 0) {
      reasons.push("No results recorded for this term")
    } else if (student.hasUnpublishedResults) {
      reasons.push("Results for this term have not been published")
    }
    if ((student.missingSubjectIds?.length ?? 0) > 0) {
      reasons.push(`${student.missingSubjectIds!.length} offered subject result(s) are missing`)
    }
  }

  if (policy.requireAllSubjectsEntered && (student.missingSubjectIds?.length ?? 0) > 0) {
    const message = `${student.missingSubjectIds!.length} offered subject result(s) are missing`
    if (!reasons.includes(message)) reasons.push(message)
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
      // Skipped when no per-subject detail was supplied — see `countCredits`. Failing a
      // learner because the caller did not collect scores would be a bug, not a rule.
      if (policy.minCreditsRequired != null && student.subjectResults) {
        if (creditsEarned < policy.minCreditsRequired) {
          reasons.push(
            `Earned ${creditsEarned} credit${creditsEarned === 1 ? "" : "s"} at ${pct(policy.creditMark)} ` +
              `or above, below the required ${policy.minCreditsRequired}`,
          )
        }
      }
      if (policy.minCoreSubjectsPassed != null) {
        const required = new Set(policy.requiredSubjectIds)
        const corePassed = (student.subjectResults ?? []).filter(
          (subject) => required.has(subject.subjectId) && subject.passed,
        ).length
        if (corePassed < policy.minCoreSubjectsPassed) {
          reasons.push(
            `Passed ${corePassed} core subject${corePassed === 1 ? "" : "s"}, below the required ${policy.minCoreSubjectsPassed}`,
          )
        }
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
    creditsEarned,
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
  minCreditsRequired: null,
  creditMark: 50,
  evaluationScope: "TERM",
  requiredSubjectIds: [],
  minCoreSubjectsPassed: null,
  requireAllSubjectsEntered: false,
  allowManualOverride: true,
  isGraduatingClass: false,
}
