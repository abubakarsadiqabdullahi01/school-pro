import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROMOTION_POLICY,
  countCredits,
  evaluatePromotionEligibility,
  type PromotionPolicy,
  type StudentResultSummary,
  type SubjectOutcome,
} from "@/lib/promotion"
import {
  decideAnnualOutcome,
  decisionLabel,
  evaluateAnnualOutcome,
  resolvePolicyForClass,
  suggestedPrincipalComment,
  type ClassPolicyOverride,
} from "@/lib/promotion-policy"

/**
 * Per-class promotion rules, the credit bar, and the end-of-session outcome.
 *
 * Three things are worth pinning down here, because getting any of them wrong decides
 * whether a real child repeats a year:
 *
 *  1. A credit is not a pass. The whole point of the credit rule is that it is stricter.
 *  2. A class override that is *absent* must inherit; a class override that is *null* must
 *     turn the rule off. Collapsing those two makes a class unable to be more lenient.
 *  3. The decision is a status. It is never parsed back out of the principal's sentence.
 */

function policy(overrides: Partial<PromotionPolicy> = {}): PromotionPolicy {
  return { ...DEFAULT_PROMOTION_POLICY, ...overrides }
}

function subjects(...scores: number[]): SubjectOutcome[] {
  return scores.map((score, index) => ({
    subjectId: `subject-${index}`,
    passed: score >= 40,
    score,
  }))
}

function student(overrides: Partial<StudentResultSummary> = {}): StudentResultSummary {
  return {
    studentId: "s1",
    name: "Ada Obi",
    subjectCount: 9,
    averageScore: 65,
    passedSubjects: 9,
    hasUnpublishedResults: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

describe("countCredits", () => {
  it("counts subjects at or above the credit mark", () => {
    expect(countCredits(subjects(80, 55, 50, 49, 41), 50)).toBe(3)
  })

  it("treats the credit mark as a floor, not a hurdle", () => {
    // Exactly 50 is a C6, which is a credit. Off-by-one here changes real outcomes.
    expect(countCredits(subjects(50), 50)).toBe(1)
    expect(countCredits(subjects(49.99), 50)).toBe(0)
  })

  it("returns zero when no per-subject detail was collected", () => {
    expect(countCredits(undefined, 50)).toBe(0)
  })
})

describe("the credit rule is stricter than the pass rule", () => {
  // The distinction the whole feature exists for: six subjects in the 40s are six passes
  // and zero credits. Before this, a school asking for "six credits" got "six passes".
  const sixWeakPasses = student({
    subjectCount: 6,
    averageScore: 44,
    passedSubjects: 6,
    subjectResults: subjects(44, 43, 42, 41, 45, 46),
  })

  it("passes a subjects-passed bar of six", () => {
    const verdict = evaluatePromotionEligibility(
      sixWeakPasses,
      policy({ usePromotionCriteria: true, minSubjectsPassed: 6 }),
    )
    expect(verdict.eligible).toBe(true)
  })

  it("fails a credits bar of six on the very same marks", () => {
    const verdict = evaluatePromotionEligibility(
      sixWeakPasses,
      policy({ usePromotionCriteria: true, minCreditsRequired: 6, creditMark: 50 }),
    )
    expect(verdict.eligible).toBe(false)
    expect(verdict.creditsEarned).toBe(0)
    expect(verdict.reasons[0]).toBe("Earned 0 credits at 50% or above, below the required 6")
  })

  it("allows a learner exactly on the credit count", () => {
    const verdict = evaluatePromotionEligibility(
      student({ subjectResults: subjects(50, 51, 52, 39, 38) }),
      policy({ usePromotionCriteria: true, minCreditsRequired: 3 }),
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.creditsEarned).toBe(3)
  })

  it("says 'credit' rather than 'credits' when exactly one was earned", () => {
    const verdict = evaluatePromotionEligibility(
      student({ subjectResults: subjects(55, 30) }),
      policy({ usePromotionCriteria: true, minCreditsRequired: 5 }),
    )
    expect(verdict.reasons[0]).toBe("Earned 1 credit at 50% or above, below the required 5")
  })

  it("honours a school's own credit mark", () => {
    const marks = student({ subjectResults: subjects(62, 61, 45) })
    expect(
      evaluatePromotionEligibility(marks, policy({ usePromotionCriteria: true, minCreditsRequired: 2, creditMark: 60 }))
        .eligible,
    ).toBe(true)
    expect(
      evaluatePromotionEligibility(marks, policy({ usePromotionCriteria: true, minCreditsRequired: 3, creditMark: 60 }))
        .eligible,
    ).toBe(false)
  })

  it("does not fail a learner just because scores were not collected", () => {
    // A caller that supplies no per-subject detail cannot be counting credits. Failing
    // everyone on a count of zero would be a bug in this module, not a school's rule.
    const verdict = evaluatePromotionEligibility(
      student({ subjectResults: undefined }),
      policy({ usePromotionCriteria: true, minCreditsRequired: 6 }),
    )
    expect(verdict.eligible).toBe(true)
  })

  it("is off by default", () => {
    expect(DEFAULT_PROMOTION_POLICY.minCreditsRequired).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------

describe("resolvePolicyForClass", () => {
  const school = policy({ usePromotionCriteria: true, minAverage: 50, minSubjectsPassed: 6 })

  it("returns the school policy untouched when a class has no override", () => {
    const resolved = resolvePolicyForClass(school, null)
    expect(resolved.policy).toEqual(school)
    expect(resolved.source).toBe("SCHOOL_DEFAULT")
    expect(resolved.overriddenFields).toEqual([])
  })

  it("inherits every field the class did not set", () => {
    const resolved = resolvePolicyForClass(school, { minAverage: 60 })
    expect(resolved.policy.minAverage).toBe(60)
    expect(resolved.policy.minSubjectsPassed).toBe(6)
    expect(resolved.policy.usePromotionCriteria).toBe(true)
    expect(resolved.source).toBe("CLASS_OVERRIDE")
    expect(resolved.overriddenFields).toEqual(["minAverage"])
  })

  it("distinguishes 'not overridden' from 'overridden to off'", () => {
    // The load-bearing case: a class must be able to be MORE lenient than its school.
    const inherited = resolvePolicyForClass(school, { minSubjectsPassed: undefined })
    expect(inherited.policy.minAverage).toBe(50)

    const switchedOff = resolvePolicyForClass(school, { minAverage: null })
    expect(switchedOff.policy.minAverage).toBeNull()
    expect(switchedOff.policy.minSubjectsPassed).toBe(6)
  })

  it("reports an override that sets nothing as inheriting", () => {
    const resolved = resolvePolicyForClass(school, {} as ClassPolicyOverride)
    expect(resolved.source).toBe("SCHOOL_DEFAULT")
  })

  it("lets one class promote on credits while the school promotes on average", () => {
    const resolved = resolvePolicyForClass(school, {
      minAverage: null,
      minCreditsRequired: 5,
      creditMark: 50,
    })
    const marks = student({ averageScore: 47, subjectResults: subjects(72, 68, 55, 51, 50, 20) })
    expect(evaluatePromotionEligibility(marks, resolved.policy).eligible).toBe(true)
    // ...and the school's own rule would have stopped the same learner.
    expect(evaluatePromotionEligibility(marks, school).eligible).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The annual decision
// ---------------------------------------------------------------------------

describe("decideAnnualOutcome", () => {
  it("promotes an eligible learner in an ordinary class", () => {
    expect(decideAnnualOutcome({ eligible: true }, { isGraduatingClass: false })).toBe("PROMOTED")
  })

  it("graduates an eligible learner in a final year", () => {
    expect(decideAnnualOutcome({ eligible: true }, { isGraduatingClass: true })).toBe("GRADUATED")
  })

  it("repeats an ineligible learner, final year or not", () => {
    expect(decideAnnualOutcome({ eligible: false }, { isGraduatingClass: false })).toBe("REPEATED")
    expect(decideAnnualOutcome({ eligible: false }, { isGraduatingClass: true })).toBe("REPEATED")
  })

  it("never returns PENDING — that is a row nobody has computed, not a rule", () => {
    const outcomes = [true, false].flatMap((eligible) =>
      [true, false].map((isGraduatingClass) => decideAnnualOutcome({ eligible }, { isGraduatingClass })),
    )
    expect(outcomes).not.toContain("PENDING")
  })
})

describe("evaluateAnnualOutcome", () => {
  it("carries the reasons through with the decision", () => {
    const { verdict, decision } = evaluateAnnualOutcome(
      student({ averageScore: 31, subjectResults: subjects(31, 30) }),
      policy({ usePromotionCriteria: true, minAverage: 50 }),
    )
    expect(decision).toBe("REPEATED")
    expect(verdict.reasons).toHaveLength(1)
  })

  it("lets a finalist who cleared the bar graduate", () => {
    const { decision } = evaluateAnnualOutcome(
      student({ averageScore: 71, subjectResults: subjects(71, 70) }),
      policy({ usePromotionCriteria: true, minAverage: 50, isGraduatingClass: true }),
    )
    expect(decision).toBe("GRADUATED")
  })

  it("lets a school waive the bar for a final year by switching the criteria off", () => {
    // The documented way to say "everyone leaves regardless" — no second flag needed.
    const { decision } = evaluateAnnualOutcome(
      student({ averageScore: 12, subjectResults: subjects(12, 10) }),
      policy({ usePromotionCriteria: false, isGraduatingClass: true }),
    )
    expect(decision).toBe("GRADUATED")
  })
})

// ---------------------------------------------------------------------------
// The principal's comment
// ---------------------------------------------------------------------------

describe("suggestedPrincipalComment", () => {
  it("names the destination class when one is known", () => {
    expect(suggestedPrincipalComment("PROMOTED", 75, "JSS 2")).toContain("JSS 2")
  })

  it("omits the destination cleanly when none is known", () => {
    const comment = suggestedPrincipalComment("PROMOTED", 75)
    expect(comment).toBe("An excellent result. Promoted.")
    expect(comment).not.toContain("undefined")
    expect(comment).not.toContain("  ")
  })

  it("softens the wording for a repeat that was nearly a pass", () => {
    expect(suggestedPrincipalComment("REPEATED", 45)).toContain("Sustained effort")
    expect(suggestedPrincipalComment("REPEATED", 20)).toContain("Close support at home")
  })

  it("returns nothing for a pending decision, rather than inventing a verdict", () => {
    expect(suggestedPrincipalComment("PENDING", 65)).toBe("")
  })

  it("is only a suggestion — the decision is never read back out of it", () => {
    // A guard against the shape of bug this module is built to avoid: the word "Promoted"
    // appearing in a REPEATED learner's comment must not be able to flip anything.
    const comment = suggestedPrincipalComment("REPEATED", 45)
    expect(comment.toLowerCase()).not.toContain("promoted")
  })
})

describe("decisionLabel", () => {
  it("prints 'Repeat' on a card rather than the enum spelling", () => {
    expect(decisionLabel("REPEATED")).toBe("Repeat")
    expect(decisionLabel("PROMOTED")).toBe("Promoted")
    expect(decisionLabel("GRADUATED")).toBe("Graduated")
    expect(decisionLabel("PENDING")).toBe("Pending")
  })
})
