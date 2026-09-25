/**
 * Which promotion rules apply to a class, and what the end of a session decides.
 *
 * Split from `lib/promotion.ts` — which answers *does this learner clear the bar* — because
 * two further questions turned out to be separate and each worth testing on its own:
 *
 *  1. **Whose bar is it?** A school has one default. A class may override it. JSS3 and SS1
 *     do not promote on the same rules in any real school, and before this the schema could
 *     not express that at all (`TransitionPolicy.schoolId` is `@unique`).
 *  2. **What does clearing it mean at year end?** Promotion is a *term* action; the annual
 *     card needs a *session* outcome, and "promoted" is not the only one — a finalist
 *     graduates, and a learner nobody has ruled on yet is pending, not promoted.
 *
 * Everything here is pure. The database side lives in `app/actions/annual-results.ts`.
 */

import {
  DEFAULT_PROMOTION_POLICY,
  evaluatePromotionEligibility,
  type EligibilityVerdict,
  type PromotionPolicy,
  type StudentResultSummary,
} from "@/lib/promotion"

/** Mirrors the `AnnualPromotionDecision` enum, without importing Prisma into a pure module. */
export type AnnualDecision = "PENDING" | "PROMOTED" | "REPEATED" | "GRADUATED"

/**
 * The fields a class may override. Every one is optional: an override row sets only what
 * the class does differently, and anything left unset falls through to the school default.
 *
 * `undefined` and `null` mean different things here and the distinction is load-bearing.
 * `undefined` is "not overridden, use the school's value". `null` is "overridden to off" —
 * which is how a class switches a minimum *off* that the school has switched on. Collapsing
 * the two would make it impossible for a class to be more lenient than its school.
 */
export type ClassPolicyOverride = {
  requireResultsPublished?: boolean
  usePromotionCriteria?: boolean
  minAverage?: number | null
  minSubjectsPassed?: number | null
  minCreditsRequired?: number | null
  creditMark?: number
  evaluationScope?: "TERM" | "SESSION_AVERAGE"
  requiredSubjectIds?: string[]
  minCoreSubjectsPassed?: number | null
  requireAllSubjectsEntered?: boolean
  allowManualOverride?: boolean
  isGraduatingClass?: boolean
}

/** Where a resolved policy's rules came from, so a screen can say "inherited" honestly. */
export type PolicySource = "SCHOOL_DEFAULT" | "CLASS_OVERRIDE"

export type ResolvedPolicy = {
  policy: PromotionPolicy
  source: PolicySource
  /** Field names the class set for itself. Empty when the class inherits everything. */
  overriddenFields: string[]
}

function pick<T>(override: T | undefined, fallback: T): T {
  return override === undefined ? fallback : override
}

/**
 * Merges a class override onto the school default.
 *
 * A class with no override resolves to the school's policy unchanged and reports
 * `SCHOOL_DEFAULT`, so nothing about an unconfigured school changes when this ships.
 */
export function resolvePolicyForClass(
  schoolPolicy: PromotionPolicy,
  override: ClassPolicyOverride | null | undefined,
): ResolvedPolicy {
  if (!override) {
    return { policy: schoolPolicy, source: "SCHOOL_DEFAULT", overriddenFields: [] }
  }

  const overriddenFields = Object.entries(override)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort()

  const policy: PromotionPolicy = {
    requireResultsPublished: pick(override.requireResultsPublished, schoolPolicy.requireResultsPublished),
    usePromotionCriteria: pick(override.usePromotionCriteria, schoolPolicy.usePromotionCriteria),
    minAverage: pick(override.minAverage, schoolPolicy.minAverage),
    minSubjectsPassed: pick(override.minSubjectsPassed, schoolPolicy.minSubjectsPassed),
    minCreditsRequired: pick(override.minCreditsRequired, schoolPolicy.minCreditsRequired),
    creditMark: pick(override.creditMark, schoolPolicy.creditMark),
    evaluationScope: pick(override.evaluationScope, schoolPolicy.evaluationScope),
    requiredSubjectIds: pick(override.requiredSubjectIds, schoolPolicy.requiredSubjectIds),
    minCoreSubjectsPassed: pick(override.minCoreSubjectsPassed, schoolPolicy.minCoreSubjectsPassed),
    requireAllSubjectsEntered: pick(
      override.requireAllSubjectsEntered,
      schoolPolicy.requireAllSubjectsEntered,
    ),
    allowManualOverride: pick(override.allowManualOverride, schoolPolicy.allowManualOverride),
    isGraduatingClass: pick(override.isGraduatingClass, schoolPolicy.isGraduatingClass),
  }

  return {
    policy,
    source: overriddenFields.length > 0 ? "CLASS_OVERRIDE" : "SCHOOL_DEFAULT",
    overriddenFields,
  }
}

/**
 * The outcome a verdict implies.
 *
 * Never returns PENDING: this function is what *resolves* pendingness. PENDING is the state
 * of a row nobody has computed yet, which is a database concern, not a rule.
 */
export function decideAnnualOutcome(
  verdict: Pick<EligibilityVerdict, "eligible">,
  policy: Pick<PromotionPolicy, "isGraduatingClass">,
): Exclude<AnnualDecision, "PENDING"> {
  if (!verdict.eligible) return "REPEATED"
  return policy.isGraduatingClass ? "GRADUATED" : "PROMOTED"
}

export type AnnualEvaluation = {
  verdict: EligibilityVerdict
  decision: Exclude<AnnualDecision, "PENDING">
}

/** Evaluates one learner against a resolved policy and names the outcome. */
export function evaluateAnnualOutcome(
  student: StudentResultSummary,
  policy: PromotionPolicy,
): AnnualEvaluation {
  const verdict = evaluatePromotionEligibility(student, policy)
  return { verdict, decision: decideAnnualOutcome(verdict, policy) }
}

/**
 * The suggested principal's comment for a decision.
 *
 * A *suggestion*, and nothing more. The principal's own words are stored separately and
 * whatever they type wins. This exists so the common case — three hundred cards, the same
 * sentence on most of them — does not have to be typed three hundred times.
 *
 * The decision itself is never derived from this text. Reading a status back out of a
 * sentence is exactly the bug this module is shaped to avoid.
 */
export function suggestedPrincipalComment(
  decision: AnnualDecision,
  averageScore: number,
  nextClassName?: string | null,
): string {
  switch (decision) {
    case "GRADUATED":
      return "Has completed the programme. We wish you every success."
    case "REPEATED":
      return averageScore >= 40
        ? "Has not met the promotion requirement and will repeat the class. Sustained effort next session is expected."
        : "Has not met the promotion requirement and will repeat the class. Close support at home is strongly advised."
    case "PROMOTED": {
      const destination = nextClassName ? ` to ${nextClassName}` : ""
      if (averageScore >= 70) return `An excellent result. Promoted${destination}.`
      if (averageScore >= 60) return `A good result. Promoted${destination}. Keep it up.`
      if (averageScore >= 50) return `A fair result. Promoted${destination}. More effort is expected.`
      return `Promoted${destination}. Considerable improvement is expected next session.`
    }
    case "PENDING":
    default:
      return ""
  }
}

/** Human label for a decision, used on screens and on the report card. */
export function decisionLabel(decision: AnnualDecision): string {
  switch (decision) {
    case "PROMOTED":
      return "Promoted"
    case "REPEATED":
      return "Repeat"
    case "GRADUATED":
      return "Graduated"
    case "PENDING":
    default:
      return "Pending"
  }
}

/** The school default, with nothing overridden. Re-exported so callers need one import. */
export { DEFAULT_PROMOTION_POLICY }
