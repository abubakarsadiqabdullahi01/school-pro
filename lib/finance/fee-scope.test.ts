import { describe, expect, it } from "vitest"

import {
  feeScheduleScopeWhere,
  isInFeeScheduleScope,
  summariseCoverage,
  type CoverageRow,
} from "./fee-scope"

const school = "school-1"

describe("feeScheduleScopeWhere", () => {
  it("bills one class when the schedule names one", () => {
    const where = feeScheduleScopeWhere({ sessionId: "s1", termId: "t1", classTermId: "ct1" }, school)
    expect(where).toEqual({
      classTermId: "ct1",
      status: "ACTIVE",
      student: { schoolId: school, user: { isActive: true } },
    })
  })

  it("bills every class in the term when no class is named", () => {
    const where = feeScheduleScopeWhere({ sessionId: "s1", termId: "t1", classTermId: null }, school)
    expect(where).toMatchObject({ termId: "t1", status: "ACTIVE" })
  })

  it("keeps a session-wide schedule inside its own session", () => {
    // Without this it reaches into other school years, and stamps a charge with a term from
    // a session nobody was billing.
    const where = feeScheduleScopeWhere({ sessionId: "s1", termId: null, classTermId: null }, school)
    expect(where).toMatchObject({ status: "ACTIVE", term: { sessionId: "s1" } })
  })

  it("requires both an active enrolment and an active student", () => {
    const where = feeScheduleScopeWhere({ sessionId: "s1", termId: null, classTermId: null }, school)
    expect(where.status).toBe("ACTIVE")
    expect(where.student.user.isActive).toBe(true)
  })
})

describe("isInFeeScheduleScope", () => {
  const enrolment = { classTermId: "ct1", termId: "t1", sessionId: "s1" }

  it("matches a class schedule on the class", () => {
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s1", termId: "t1", classTermId: "ct1" })).toBe(true)
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s1", termId: "t1", classTermId: "ct2" })).toBe(false)
  })

  it("matches a term schedule on the term, whatever the class", () => {
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s1", termId: "t1", classTermId: null })).toBe(true)
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s1", termId: "t2", classTermId: null })).toBe(false)
  })

  it("matches a session schedule on the session", () => {
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s1", termId: null, classTermId: null })).toBe(true)
    expect(isInFeeScheduleScope(enrolment, { sessionId: "s2", termId: null, classTermId: null })).toBe(false)
  })
})

describe("summariseCoverage", () => {
  const rows: CoverageRow[] = [
    { studentId: "a", className: "JSS 1A" },
    { studentId: "b", className: "JSS 1A" },
    { studentId: "c", className: "JSS 2A" },
  ]

  it("counts who is covered and who has a charge", () => {
    const coverage = summariseCoverage(rows, new Set(["a"]))
    expect(coverage).toMatchObject({ inScope: 3, billed: 1, unbilled: 2 })
  })

  it("breaks the gap down by class, worst first", () => {
    const coverage = summariseCoverage(rows, new Set(["a"]))
    expect(coverage.byClass).toEqual([
      { className: "JSS 1A", inScope: 2, billed: 1, unbilled: 1 },
      { className: "JSS 2A", inScope: 1, billed: 0, unbilled: 1 },
    ])
  })

  it("counts a student once however many enrolments they hold in scope", () => {
    // A whole-session schedule sees the same student in every term of the year.
    const repeated: CoverageRow[] = [
      { studentId: "a", className: "JSS 1A" },
      { studentId: "a", className: "JSS 1A" },
    ]
    expect(summariseCoverage(repeated, new Set())).toMatchObject({ inScope: 1, unbilled: 1 })
  })

  it("reports nothing missing when everyone has been billed", () => {
    expect(summariseCoverage(rows, new Set(["a", "b", "c"]))).toMatchObject({ billed: 3, unbilled: 0 })
  })

  it("copes with a schedule whose scope is empty", () => {
    expect(summariseCoverage([], new Set())).toEqual({ inScope: 0, billed: 0, unbilled: 0, byClass: [] })
  })
})
