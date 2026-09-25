import { describe, expect, it } from "vitest"
import {
  DEFAULT_PROMOTION_POLICY,
  evaluatePromotionEligibility,
  splitByEligibility,
  type PromotionPolicy,
  type StudentResultSummary,
} from "@/lib/promotion"

/**
 * Promotion eligibility.
 *
 * This rule decides whether a child repeats a year, so the cases that matter are the edges:
 * exactly on the pass mark, no results at all, and each switch on independently.
 */

function student(overrides: Partial<StudentResultSummary> = {}): StudentResultSummary {
  return {
    studentId: "s1",
    name: "Ada Obi",
    subjectCount: 9,
    averageScore: 65,
    passedSubjects: 8,
    hasUnpublishedResults: false,
    ...overrides,
  }
}

function policy(overrides: Partial<PromotionPolicy> = {}): PromotionPolicy {
  return { ...DEFAULT_PROMOTION_POLICY, ...overrides }
}

describe("with both rules off", () => {
  it("promotes everyone, which is how the module behaved before any policy existed", () => {
    // Turning the feature on must be a choice; the default must not change an existing school.
    const verdict = evaluatePromotionEligibility(
      student({ averageScore: 3, passedSubjects: 0, hasUnpublishedResults: true }),
      DEFAULT_PROMOTION_POLICY,
    )
    expect(verdict.eligible).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it("promotes a student with no results at all", () => {
    expect(
      evaluatePromotionEligibility(student({ subjectCount: 0, averageScore: 0 }), DEFAULT_PROMOTION_POLICY)
        .eligible,
    ).toBe(true)
  })
})

describe("requireResultsPublished", () => {
  const p = policy({ requireResultsPublished: true })

  it("blocks a student whose results are not yet published", () => {
    const verdict = evaluatePromotionEligibility(student({ hasUnpublishedResults: true }), p)
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons).toContain("Results for this term have not been published")
  })

  it("blocks a student with no results recorded", () => {
    const verdict = evaluatePromotionEligibility(student({ subjectCount: 0 }), p)
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons).toContain("No results recorded for this term")
  })

  it("allows a student whose results are published, whatever the marks", () => {
    // This switch is about the results existing, not about how good they are.
    const verdict = evaluatePromotionEligibility(
      student({ averageScore: 12, passedSubjects: 0, hasUnpublishedResults: false }),
      p,
    )
    expect(verdict.eligible).toBe(true)
  })
})

describe("usePromotionCriteria — average", () => {
  const p = policy({ usePromotionCriteria: true, minAverage: 50 })

  it("blocks a student below the required average and says by how much", () => {
    const verdict = evaluatePromotionEligibility(student({ averageScore: 42.5 }), p)
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons[0]).toBe("Average 42.5% is below the required 50%")
  })

  it("allows a student exactly on the mark", () => {
    // A pass mark is a floor, not a hurdle to clear: exactly 50 passes.
    expect(evaluatePromotionEligibility(student({ averageScore: 50 }), p).eligible).toBe(true)
  })

  it("allows a student above the mark", () => {
    expect(evaluatePromotionEligibility(student({ averageScore: 50.01 }), p).eligible).toBe(true)
  })

  it("rounds the reported average to one place rather than printing a repeating decimal", () => {
    const verdict = evaluatePromotionEligibility(student({ averageScore: 100 / 3 }), p)
    expect(verdict.reasons[0]).toContain("33.3%")
  })
})

describe("usePromotionCriteria — subjects passed", () => {
  const p = policy({ usePromotionCriteria: true, minSubjectsPassed: 6 })

  it("blocks a student who passed too few subjects", () => {
    const verdict = evaluatePromotionEligibility(student({ passedSubjects: 5 }), p)
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons[0]).toBe("Passed 5 subjects, below the required 6")
  })

  it("allows a student exactly on the threshold", () => {
    expect(evaluatePromotionEligibility(student({ passedSubjects: 6 }), p).eligible).toBe(true)
  })

  it("says 'subject' rather than 'subjects' when only one was passed", () => {
    const verdict = evaluatePromotionEligibility(student({ passedSubjects: 1 }), p)
    expect(verdict.reasons[0]).toBe("Passed 1 subject, below the required 6")
  })
})

describe("both criteria together", () => {
  const p = policy({ usePromotionCriteria: true, minAverage: 50, minSubjectsPassed: 6 })

  it("reports every reason, not just the first", () => {
    // An admin fixing this wants the whole picture in one pass.
    const verdict = evaluatePromotionEligibility(student({ averageScore: 40, passedSubjects: 3 }), p)
    expect(verdict.reasons).toHaveLength(2)
  })

  it("requires both to be met", () => {
    expect(evaluatePromotionEligibility(student({ averageScore: 80, passedSubjects: 3 }), p).eligible).toBe(false)
    expect(evaluatePromotionEligibility(student({ averageScore: 40, passedSubjects: 9 }), p).eligible).toBe(false)
    expect(evaluatePromotionEligibility(student({ averageScore: 80, passedSubjects: 9 }), p).eligible).toBe(true)
  })

  it("does not measure a student with no results against a bar", () => {
    const verdict = evaluatePromotionEligibility(student({ subjectCount: 0, averageScore: 0, passedSubjects: 0 }), p)
    expect(verdict.eligible).toBe(false)
    // One clear reason, not a spurious "average 0% is below 50%".
    expect(verdict.reasons).toEqual(["No results recorded to assess against the promotion criteria"])
  })
})

describe("configured subject requirements", () => {
  it("blocks promotion when an offered subject is missing", () => {
    const verdict = evaluatePromotionEligibility(
      student({ missingSubjectIds: ["math"] }),
      policy({ requireAllSubjectsEntered: true }),
    )
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons).toContain("1 offered subject result(s) are missing")
  })

  it("enforces the minimum number of passed core subjects", () => {
    const verdict = evaluatePromotionEligibility(
      student({
        subjectResults: [
          { subjectId: "math", passed: true, score: 72 },
          { subjectId: "english", passed: false, score: 31 },
        ],
      }),
      policy({
        usePromotionCriteria: true,
        requiredSubjectIds: ["math", "english"],
        minCoreSubjectsPassed: 2,
      }),
    )
    expect(verdict.eligible).toBe(false)
    expect(verdict.reasons).toContain("Passed 1 core subject, below the required 2")
  })
})

describe("both switches on", () => {
  const p = policy({
    requireResultsPublished: true,
    usePromotionCriteria: true,
    minAverage: 50,
  })

  it("does not repeat the same complaint twice for a student with no results", () => {
    const verdict = evaluatePromotionEligibility(student({ subjectCount: 0 }), p)
    expect(verdict.reasons).toEqual(["No results recorded for this term"])
  })

  it("blocks on publication and on the mark independently", () => {
    const unpublished = evaluatePromotionEligibility(
      student({ hasUnpublishedResults: true, averageScore: 90 }),
      p,
    )
    expect(unpublished.eligible).toBe(false)
    expect(unpublished.reasons).toHaveLength(1)

    const failing = evaluatePromotionEligibility(student({ averageScore: 20 }), p)
    expect(failing.eligible).toBe(false)
    expect(failing.reasons).toHaveLength(1)
  })
})

describe("splitByEligibility", () => {
  it("separates a class into those who go up and those who do not", () => {
    const p = policy({ usePromotionCriteria: true, minAverage: 50 })
    const { eligible, ineligible } = splitByEligibility(
      [
        student({ studentId: "a", name: "Ada", averageScore: 71 }),
        student({ studentId: "b", name: "Bola", averageScore: 48 }),
        student({ studentId: "c", name: "Chidi", averageScore: 55 }),
      ],
      p,
    )

    expect(eligible.map((v) => v.studentId)).toEqual(["a", "c"])
    expect(ineligible.map((v) => v.studentId)).toEqual(["b"])
    expect(ineligible[0].reasons[0]).toContain("48%")
  })

  it("keeps everyone eligible under the default policy", () => {
    const { eligible, ineligible } = splitByEligibility(
      [student({ studentId: "a", averageScore: 10 }), student({ studentId: "b", averageScore: 90 })],
      DEFAULT_PROMOTION_POLICY,
    )
    expect(eligible).toHaveLength(2)
    expect(ineligible).toHaveLength(0)
  })
})
