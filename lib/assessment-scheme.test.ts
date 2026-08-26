import { describe, expect, it } from "vitest"
import {
  DEFAULT_ASSESSMENT_SCHEME,
  assertScoresWithinScheme,
  schemeComponents,
  schemeTotal,
  validateScheme,
  type AssessmentScheme,
} from "@/lib/assessment-scheme"

/**
 * The scheme rules. What these replace was `validateScore(assessment.ca1, "CA1", 10)`
 * repeated across three action files — correct enforcement of exactly one scheme.
 */

const TWO_CAS: AssessmentScheme = {
  name: "Two CAs and an exam",
  ca1Max: 20,
  ca2Max: 20,
  ca3Max: 0,
  examMax: 60,
}

const FORTY_SIXTY: AssessmentScheme = {
  name: "40/60",
  ca1Max: 20,
  ca2Max: 20,
  ca3Max: 0,
  examMax: 60,
}

describe("schemeTotal", () => {
  it("adds the components up", () => {
    expect(schemeTotal(DEFAULT_ASSESSMENT_SCHEME)).toBe(100)
    expect(schemeTotal(TWO_CAS)).toBe(100)
  })

  it("ignores unused slots, which contribute zero", () => {
    expect(schemeTotal({ ...TWO_CAS, ca3Max: 0 })).toBe(schemeTotal(TWO_CAS))
  })
})

describe("schemeComponents", () => {
  it("lists the three CAs and the exam for the default scheme", () => {
    expect(schemeComponents(DEFAULT_ASSESSMENT_SCHEME).map((c) => c.label)).toEqual([
      "CA1",
      "CA2",
      "CA3",
      "Exam",
    ])
  })

  it("omits a component set to zero, which is how a two-CA school is expressed", () => {
    expect(schemeComponents(TWO_CAS).map((c) => c.label)).toEqual(["CA1", "CA2", "Exam"])
  })

  it("carries each component's maximum, for the column headers", () => {
    expect(schemeComponents(TWO_CAS)).toEqual([
      { key: "ca1", label: "CA1", max: 20 },
      { key: "ca2", label: "CA2", max: 20 },
      { key: "exam", label: "Exam", max: 60 },
    ])
  })

  it("returns nothing for a scheme with no marks anywhere", () => {
    expect(schemeComponents({ name: "Empty", ca1Max: 0, ca2Max: 0, ca3Max: 0, examMax: 0 })).toEqual([])
  })
})

describe("validateScheme", () => {
  it("accepts the schemes real schools use", () => {
    expect(validateScheme(DEFAULT_ASSESSMENT_SCHEME)).toEqual([])
    expect(validateScheme(TWO_CAS)).toEqual([])
    expect(validateScheme(FORTY_SIXTY)).toEqual([])
    // Continuous-assessment only, no exam.
    expect(validateScheme({ name: "CA only", ca1Max: 40, ca2Max: 30, ca3Max: 30, examMax: 0 })).toEqual([])
  })

  it("requires a name, so staff can tell which scheme is in use", () => {
    expect(validateScheme({ ...TWO_CAS, name: "   " })).toContain(
      "Give the scheme a name, so staff know which one is in use.",
    )
  })

  it("rejects a negative component and points at the right fix", () => {
    const problems = validateScheme({ ...TWO_CAS, ca3Max: -5 })
    expect(problems).toContain("CA3 cannot be negative. Use 0 if it is not used.")
  })

  it("rejects a non-whole mark", () => {
    expect(validateScheme({ ...TWO_CAS, examMax: 60.5 })).toContain("Exam must be a whole number.")
  })

  it("rejects a scheme with no marks at all", () => {
    expect(validateScheme({ name: "Empty", ca1Max: 0, ca2Max: 0, ca3Max: 0, examMax: 0 })).toContain(
      "At least one component needs a mark above 0.",
    )
  })

  it("rejects a scheme totalling more than 100, naming the total", () => {
    const problems = validateScheme({ name: "Too much", ca1Max: 30, ca2Max: 30, ca3Max: 30, examMax: 30 })
    expect(problems.some((p) => p.includes("120"))).toBe(true)
  })

  it("reports every problem at once rather than one at a time", () => {
    const problems = validateScheme({ name: "", ca1Max: -1, ca2Max: 0, ca3Max: 0, examMax: 0 })
    expect(problems.length).toBeGreaterThan(1)
  })
})

describe("assertScoresWithinScheme", () => {
  it("accepts scores within the school's own bounds", () => {
    expect(() =>
      assertScoresWithinScheme({ ca1: 20, ca2: 20, exam: 60 }, TWO_CAS),
    ).not.toThrow()
  })

  it("accepts a score at the maximum and at zero", () => {
    expect(() => assertScoresWithinScheme({ exam: 60 }, TWO_CAS)).not.toThrow()
    expect(() => assertScoresWithinScheme({ exam: 0 }, TWO_CAS)).not.toThrow()
  })

  it("rejects a score above the school's own maximum", () => {
    expect(() => assertScoresWithinScheme({ ca1: 21 }, TWO_CAS)).toThrow(/between 0 and 20/)
  })

  it("rejects a negative score", () => {
    expect(() => assertScoresWithinScheme({ exam: -1 }, TWO_CAS)).toThrow(/between 0 and 60/)
  })

  it("accepts a score the old hardcoded rule would have rejected", () => {
    // CA1 of 20 was impossible before: every school was fixed at a maximum of 10.
    expect(() => assertScoresWithinScheme({ ca1: 20 }, TWO_CAS)).not.toThrow()
    expect(() => assertScoresWithinScheme({ ca1: 20 }, DEFAULT_ASSESSMENT_SCHEME)).toThrow(
      /between 0 and 10/,
    )
  })

  it("rejects a score entered against a component the school does not use", () => {
    // A screen offering a CA3 column to a two-CA school is worth surfacing, not storing.
    expect(() => assertScoresWithinScheme({ ca3: 5 }, TWO_CAS)).toThrow(/CA3 is not used/)
  })

  it("ignores components that were not submitted", () => {
    expect(() => assertScoresWithinScheme({}, TWO_CAS)).not.toThrow()
    expect(() => assertScoresWithinScheme({ ca1: null, exam: undefined }, TWO_CAS)).not.toThrow()
  })

  it("rejects NaN rather than storing it", () => {
    expect(() => assertScoresWithinScheme({ ca1: Number.NaN }, TWO_CAS)).toThrow()
  })
})

describe("DEFAULT_ASSESSMENT_SCHEME", () => {
  it("is the split that was previously hardcoded, so nothing changes for existing schools", () => {
    expect(DEFAULT_ASSESSMENT_SCHEME.ca1Max).toBe(10)
    expect(DEFAULT_ASSESSMENT_SCHEME.ca2Max).toBe(10)
    expect(DEFAULT_ASSESSMENT_SCHEME.ca3Max).toBe(10)
    expect(DEFAULT_ASSESSMENT_SCHEME.examMax).toBe(70)
    expect(schemeTotal(DEFAULT_ASSESSMENT_SCHEME)).toBe(100)
  })

  it("is itself valid", () => {
    expect(validateScheme(DEFAULT_ASSESSMENT_SCHEME)).toEqual([])
  })
})
