import { describe, expect, it, vi } from "vitest"
import {
  FALLBACK_BANDS,
  FALLBACK_PASS_MARK,
  calculateGrade,
  getPassRate,
  gradeForScore,
  isPassing,
  matchBand,
  resolveGrade,
  type GradeBand,
  type ScoreBand,
  type GradingSystem,
} from "@/lib/grading"

/**
 * Grading is now one implementation. This file previously asserted that three of them
 * disagreed — the same mark grading as B2, A, and F — which was the evidence for
 * consolidating them. Those tests are gone because the divergence is gone; what replaces
 * them are the two rules that fell out of it, in the `flooring` and `never invents a grade`
 * blocks below.
 */

const WAEC_BANDS: GradeBand[] = [
  { minScore: 80, maxScore: 100, grade: "A1", remark: "Excellent" },
  { minScore: 70, maxScore: 79, grade: "B2", remark: "Very Good" },
  { minScore: 65, maxScore: 69, grade: "B3", remark: "Good" },
  { minScore: 60, maxScore: 64, grade: "C4", remark: "Credit" },
  { minScore: 55, maxScore: 59, grade: "C5", remark: "Credit" },
  { minScore: 50, maxScore: 54, grade: "C6", remark: "Credit" },
  { minScore: 45, maxScore: 49, grade: "D7", remark: "Pass" },
  { minScore: 40, maxScore: 44, grade: "E8", remark: "Pass" },
  { minScore: 0, maxScore: 39, grade: "F9", remark: "Fail" },
]

const WAEC: GradingSystem = { levels: WAEC_BANDS, passMark: 40 }

describe("matchBand", () => {
  it("finds the band containing a score", () => {
    expect(matchBand(85, WAEC_BANDS)?.grade).toBe("A1")
    expect(matchBand(52, WAEC_BANDS)?.grade).toBe("C6")
  })

  it("treats band boundaries as inclusive at both ends", () => {
    expect(matchBand(45, WAEC_BANDS)?.grade).toBe("D7")
    expect(matchBand(49, WAEC_BANDS)?.grade).toBe("D7")
  })

  it("returns null for a missing score", () => {
    expect(matchBand(null, WAEC_BANDS)).toBeNull()
    expect(matchBand(undefined, WAEC_BANDS)).toBeNull()
    expect(matchBand(Number.NaN, WAEC_BANDS)).toBeNull()
  })

  it("returns null when no band covers the score", () => {
    // A minimal band — matching does not need a remark, which is why ScoreBand exists.
    const gapped: ScoreBand[] = [{ minScore: 50, maxScore: 100, grade: "P" }]
    expect(matchBand(20, gapped)).toBeNull()
    expect(matchBand(20, [])).toBeNull()
  })
})

describe("flooring — the 79.9 bug", () => {
  it("grades a fractional mark on its whole part", () => {
    // The old lib/grading compared the raw value: 79.9 satisfied no band's upper bound,
    // fell through every level, and returned a hardcoded "F". A distinction reported as a
    // fail.
    expect(gradeForScore(79.9, WAEC_BANDS)).toBe("B2")
    expect(gradeForScore(80.0, WAEC_BANDS)).toBe("A1")
  })

  it("holds at every band boundary, which is where the old bug fired", () => {
    for (const [score, expected] of [
      [44.5, "E8"],
      [49.5, "D7"],
      [54.5, "C6"],
      [59.5, "C5"],
      [64.5, "C4"],
      [69.5, "B3"],
      [79.5, "B2"],
    ] as const) {
      expect(gradeForScore(score, WAEC_BANDS)).toBe(expected)
    }
  })

  it("agrees with the class-term aggregation, which is the same function", async () => {
    const { gradeForScore: fromAggregation } = await import("@/lib/results/class-term-results")
    expect(fromAggregation(79.9, WAEC_BANDS)).toBe(gradeForScore(79.9, WAEC_BANDS))
  })
})

describe("resolveGrade — never invents a grade", () => {
  it("resolves against the school's own bands", () => {
    expect(resolveGrade(85, WAEC)).toEqual({ grade: "A1", remark: "Excellent", passed: true })
  })

  it("reports no grade, rather than a fail, when no band covers the score", () => {
    const gapped: GradingSystem = {
      levels: [{ minScore: 50, maxScore: 100, grade: "P", remark: "Pass" }],
      passMark: 50,
    }
    const result = resolveGrade(20, gapped)

    expect(result.grade).toBeNull()
    expect(result.remark).toBe("Grade unavailable")
    expect(result.passed).toBe(false)
  })

  it("reports no grade for a missing score", () => {
    expect(resolveGrade(null, WAEC).grade).toBeNull()
    expect(resolveGrade(undefined, WAEC).grade).toBeNull()
  })

  it("judges pass against the school's pass mark, not the band letter", () => {
    // A school whose threshold sits above its own lowest "pass"-looking band.
    const strict: GradingSystem = { levels: WAEC_BANDS, passMark: 50 }

    expect(resolveGrade(45, strict)).toEqual({ grade: "D7", remark: "Pass", passed: false })
    expect(resolveGrade(50, strict).passed).toBe(true)
  })

  it("falls back to the built-in scale when a school has configured nothing — and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(resolveGrade(85, null).grade).toBe("A1")
    expect(resolveGrade(85, { levels: [], passMark: 40 }).grade).toBe("A1")

    // The old code fell back silently in three places, so a school could run a whole term
    // on a scale nobody had chosen.
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toMatch(/no grading system configured/i)

    warn.mockRestore()
  })

  it("uses the fallback pass mark when falling back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(resolveGrade(FALLBACK_PASS_MARK, null).passed).toBe(true)
    expect(resolveGrade(FALLBACK_PASS_MARK - 1, null).passed).toBe(false)
    warn.mockRestore()
  })
})

describe("FALLBACK_BANDS", () => {
  it("covers 0 to 100 with no gap, so the fallback can never fail to match", () => {
    for (let score = 0; score <= 100; score++) {
      expect(matchBand(score, FALLBACK_BANDS), `no band for ${score}`).not.toBeNull()
    }
  })

  it("has no overlapping bands", () => {
    const sorted = [...FALLBACK_BANDS].sort((a, b) => a.minScore - b.minScore)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].minScore).toBe(sorted[i - 1].maxScore + 1)
    }
  })
})

describe("calculateGrade", () => {
  it("is the same function as resolveGrade, kept for existing callers", () => {
    expect(calculateGrade).toBe(resolveGrade)
  })
})

describe("helpers", () => {
  it("treats the pass mark itself as a pass", () => {
    expect(isPassing(40, 40)).toBe(true)
    expect(isPassing(39.5, 40)).toBe(false)
  })

  it("computes a pass rate as a percentage", () => {
    expect(getPassRate([80, 60, 30, 20], 40)).toBe(50)
  })

  it("reports zero for an empty class rather than NaN", () => {
    expect(getPassRate([], 40)).toBe(0)
  })
})
