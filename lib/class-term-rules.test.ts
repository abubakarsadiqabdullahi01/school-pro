import { describe, expect, it } from "vitest"

import { canRemoveClassFromTerm, canRemoveSubjectFromClassTerm } from "@/lib/class-term-rules"

describe("canRemoveClassFromTerm", () => {
  it("allows removing a class nobody has been enrolled in or marked for", () => {
    expect(canRemoveClassFromTerm({ enrolledStudents: 0, recordedScores: 0 }).allowed).toBe(true)
  })

  it("refuses while students are on the roll, and says how many", () => {
    const verdict = canRemoveClassFromTerm({ enrolledStudents: 12, recordedScores: 0 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("12 students are enrolled")
  })

  it("reads naturally for a single student", () => {
    const verdict = canRemoveClassFromTerm({ enrolledStudents: 1, recordedScores: 0 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 student is enrolled")
  })

  it("refuses an empty class that has already been marked", () => {
    const verdict = canRemoveClassFromTerm({ enrolledStudents: 0, recordedScores: 96 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("96 scores have been recorded")
  })

  it("leads with the roll when both would block it", () => {
    const verdict = canRemoveClassFromTerm({ enrolledStudents: 12, recordedScores: 96 })
    expect(verdict.allowed === false && verdict.reason).toContain("enrolled")
  })
})

describe("canRemoveSubjectFromClassTerm", () => {
  it("allows dropping a subject nobody has marked", () => {
    expect(canRemoveSubjectFromClassTerm({ recordedScores: 0 }).allowed).toBe(true)
  })

  it("refuses once scores exist, and says how many", () => {
    const verdict = canRemoveSubjectFromClassTerm({ recordedScores: 11 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toBe("11 scores already recorded this term.")
  })

  it("reads naturally for a single score", () => {
    const verdict = canRemoveSubjectFromClassTerm({ recordedScores: 1 })
    expect(verdict.allowed === false && verdict.reason).toBe("1 score already recorded this term.")
  })
})
