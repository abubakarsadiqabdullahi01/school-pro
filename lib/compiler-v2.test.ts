import { describe, expect, it } from "vitest"
import {
  assertWorkflowTransition,
  computeCumulativeResult,
  evaluateFlexiblePromotion,
  nextWorkflowTransition,
} from "@/lib/compiler-v2"

describe("cumulative compiler results", () => {
  it("averages subjects across terms and tracks missing or unpublished rows", () => {
    const result = computeCumulativeResult(
      [
        { termId: "t1", subjectId: "math", score: 70, isPublished: true },
        { termId: "t2", subjectId: "math", score: 80, isPublished: true },
        { termId: "t1", subjectId: "english", score: 45, isPublished: false },
        { termId: "t2", subjectId: "english", score: null, isAbsent: true, isPublished: true },
      ],
      ["math", "english", "science"],
      50,
    )

    expect(result.subjectResults).toEqual([
      expect.objectContaining({ subjectId: "math", average: 75, passed: true, termsCounted: 2 }),
      expect.objectContaining({ subjectId: "english", average: 45, passed: false, termsCounted: 1 }),
    ])
    expect(result.subjectsPassed).toBe(1)
    expect(result.totalAverage).toBe(60)
    expect(result.hasUnpublishedResults).toBe(true)
    expect(result.missingSubjectIds).toEqual(["science"])
  })
})

describe("flexible promotion policy", () => {
  it("applies average, pass count, core subject, publication, and completeness rules together", () => {
    const cumulative = computeCumulativeResult(
      [
        { termId: "t1", subjectId: "math", score: 62, isPublished: true },
        { termId: "t1", subjectId: "english", score: 44, isPublished: false },
      ],
      ["math", "english", "science"],
      50,
    )

    const evaluation = evaluateFlexiblePromotion(cumulative, {
      requireResultsPublished: true,
      usePromotionCriteria: true,
      minAverage: 60,
      minSubjectsPassed: 2,
      requiredSubjectIds: ["math", "english"],
      minCoreSubjectsPassed: 2,
      requireAllSubjectsEntered: true,
      allowManualOverride: true,
      passMark: 50,
    })

    expect(evaluation.eligible).toBe(false)
    expect(evaluation.canOverride).toBe(true)
    expect(evaluation.coreSubjectsPassed).toBe(1)
    expect(evaluation.reasons).toEqual([
      "Some results are still unpublished",
      "1 required subject result(s) are missing",
      "Average 53% is below 60%",
      "Passed 1 subject(s), below 2",
      "Passed 1 core subject(s), below 2",
    ])
  })

  it("can refuse manual overrides for strict schools", () => {
    const evaluation = evaluateFlexiblePromotion(
      {
        subjectResults: [],
        subjectsCounted: 0,
        subjectsPassed: 0,
        totalAverage: 0,
        hasUnpublishedResults: false,
        missingSubjectIds: [],
      },
      {
        requireResultsPublished: false,
        usePromotionCriteria: true,
        minAverage: 50,
        minSubjectsPassed: null,
        requiredSubjectIds: [],
        minCoreSubjectsPassed: null,
        requireAllSubjectsEntered: false,
        allowManualOverride: false,
        passMark: 50,
      },
    )

    expect(evaluation.eligible).toBe(false)
    expect(evaluation.canOverride).toBe(false)
  })
})

describe("result workflow transitions", () => {
  it("defines review, publish, lock, withdraw, and reopen transitions with permissions", () => {
    expect(nextWorkflowTransition("DRAFT", "REVIEWED")).toEqual(
      expect.objectContaining({ permission: "compiler.review_results" }),
    )
    expect(nextWorkflowTransition("REVIEWED", "PUBLISHED")).toEqual(
      expect.objectContaining({ permission: "compiler.publish_results" }),
    )
    expect(nextWorkflowTransition("PUBLISHED", "LOCKED")).toEqual(
      expect.objectContaining({ permission: "compiler.lock_results" }),
    )
  })

  it("rejects illegal moves, missing permissions, and unexplained withdrawals", () => {
    expect(() =>
      assertWorkflowTransition("DRAFT", "LOCKED", new Set(["compiler.lock_results"])),
    ).toThrow(/cannot move/i)

    expect(() => assertWorkflowTransition("REVIEWED", "PUBLISHED", new Set())).toThrow(
      /missing permission/i,
    )

    expect(() =>
      assertWorkflowTransition("PUBLISHED", "WITHDRAWN", new Set(["compiler.publish_results"])),
    ).toThrow(/reason/i)
  })
})
