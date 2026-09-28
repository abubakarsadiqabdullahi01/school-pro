import { describe, expect, it } from "vitest"

import { canDeleteSubject, canUseSubjectCode, canUseSubjectName } from "@/lib/subject-rules"

describe("canDeleteSubject", () => {
  it("allows deleting a subject nothing uses", () => {
    expect(canDeleteSubject({ classAssignments: 0, recordedScores: 0 }).allowed).toBe(true)
  })

  it("refuses while it is on a class's timetable", () => {
    const verdict = canDeleteSubject({ classAssignments: 18, recordedScores: 0 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("18 class terms")
  })

  // The case the class check misses: dropped from every class, but the marks remain.
  it("refuses a dropped subject that still holds results", () => {
    const verdict = canDeleteSubject({ classAssignments: 0, recordedScores: 240 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("240 results have been recorded")
  })

  it("reads naturally in the singular", () => {
    expect(canDeleteSubject({ classAssignments: 1, recordedScores: 0 }).allowed === false).toBe(true)
    const one = canDeleteSubject({ classAssignments: 1, recordedScores: 0 })
    expect(one.allowed === false && one.reason).toContain("1 class term")
  })
})

describe("canUseSubjectCode", () => {
  const existing = ["MTH", "ENG", "BSC"]

  it("allows a free code", () => {
    expect(canUseSubjectCode("PHY", existing).allowed).toBe(true)
  })

  it("refuses a duplicate regardless of case or spacing", () => {
    expect(canUseSubjectCode("MTH", existing).allowed).toBe(false)
    expect(canUseSubjectCode(" mth ", existing).allowed).toBe(false)
  })

  it("does not treat a subject as clashing with itself while being edited", () => {
    expect(canUseSubjectCode("MTH", existing, "MTH").allowed).toBe(true)
  })

  it("still refuses renaming onto another subject's code", () => {
    expect(canUseSubjectCode("ENG", existing, "MTH").allowed).toBe(false)
  })
})

describe("canUseSubjectName", () => {
  const existing = ["Mathematics", "English Language"]

  it("allows a free name", () => {
    expect(canUseSubjectName("Physics", existing).allowed).toBe(true)
  })

  it("refuses a duplicate name even when the code would differ", () => {
    const verdict = canUseSubjectName("mathematics", existing)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toMatch(/already exists/i)
  })

  it("does not treat a subject as clashing with itself while being edited", () => {
    expect(canUseSubjectName("Mathematics", existing, "Mathematics").allowed).toBe(true)
  })
})
