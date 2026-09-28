import { describe, expect, it } from "vitest"

import { canChangeClassLevel, canDeleteClass, canUseClassName } from "@/lib/class-rules"

describe("canDeleteClass", () => {
  it("allows deleting a class nobody has been enrolled in", () => {
    expect(canDeleteClass({ enrolments: 0, recordedScores: 0 }).allowed).toBe(true)
  })

  it("refuses while students are enrolled, and says how many", () => {
    const verdict = canDeleteClass({ enrolments: 33, recordedScores: 0 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("33 enrolment records")
    expect(verdict.allowed === false && verdict.reason).not.toContain("result")
  })

  it("names the results too when there are any", () => {
    const verdict = canDeleteClass({ enrolments: 33, recordedScores: 480 })
    expect(verdict.allowed === false && verdict.reason).toContain("480 recorded results")
  })

  it("reads naturally for a single enrolment", () => {
    const verdict = canDeleteClass({ enrolments: 1, recordedScores: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 enrolment record")
    expect(verdict.allowed === false && verdict.reason).toContain("1 recorded result")
  })
})

describe("canUseClassName", () => {
  const existing = ["JSS 1A", "JSS 2A", "SSS 1A"]

  it("allows a name the school is not using", () => {
    expect(canUseClassName("JSS 3A", existing).allowed).toBe(true)
  })

  it("refuses a duplicate", () => {
    const verdict = canUseClassName("JSS 1A", existing)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/already exists/i)
  })

  it("catches a duplicate that differs only by case or spacing", () => {
    expect(canUseClassName("  jss 1a ", existing).allowed).toBe(false)
    expect(canUseClassName("Jss 1A", existing).allowed).toBe(false)
  })

  it("does not treat a class as clashing with itself while being edited", () => {
    expect(canUseClassName("JSS 1A", existing, "JSS 1A").allowed).toBe(true)
    expect(canUseClassName("jss 1a", existing, "JSS 1A").allowed).toBe(true)
  })

  it("still refuses renaming onto another class's name", () => {
    expect(canUseClassName("JSS 2A", existing, "JSS 1A").allowed).toBe(false)
  })

  it("leaves an empty name to the form's own validation", () => {
    expect(canUseClassName("   ", existing).allowed).toBe(true)
  })
})

describe("canChangeClassLevel", () => {
  it("allows a section change before anything has been marked", () => {
    expect(canChangeClassLevel({ recordedScores: 0 }).allowed).toBe(true)
  })

  it("fixes the section once results exist", () => {
    const verdict = canChangeClassLevel({ recordedScores: 480 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("480 results have been recorded")
  })
})
