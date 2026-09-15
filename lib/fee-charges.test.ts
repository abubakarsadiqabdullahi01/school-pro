import { describe, expect, it } from "vitest"
import { coversEnrolment, schedulesForEnrolment, type SchedulableFee } from "@/lib/fee-charges"

/**
 * Which fees a newly enrolled student attracts.
 *
 * The bug this guards against is silent in the worst way: a student who is never
 * charged looks fully paid. So the cases below are mostly about a schedule
 * reaching a student it should not, and a student missing one they should get.
 */

const enrolment = { classTermId: "jss1a-term1", termId: "term1" }

function schedule(id: string, overrides: Partial<SchedulableFee> = {}): SchedulableFee {
  return { id, classTermId: null, termId: null, appliesTo: "ALL_STUDENTS", ...overrides }
}

const ids = (schedules: SchedulableFee[]) => schedules.map((s) => s.id)

describe("coversEnrolment — scope", () => {
  it("matches a schedule pinned to this exact class term", () => {
    expect(coversEnrolment(schedule("a", { classTermId: "jss1a-term1", termId: "term1" }), enrolment)).toBe(true)
  })

  it("does not reach another class in the same term", () => {
    expect(coversEnrolment(schedule("a", { classTermId: "jss2b-term1", termId: "term1" }), enrolment)).toBe(false)
  })

  it("matches a term-wide schedule with no class", () => {
    expect(coversEnrolment(schedule("a", { termId: "term1" }), enrolment)).toBe(true)
  })

  it("does not reach an enrolment in a different term", () => {
    expect(coversEnrolment(schedule("a", { termId: "term2" }), enrolment)).toBe(false)
  })

  it("matches a session-wide schedule that pins nothing down", () => {
    expect(coversEnrolment(schedule("a"), enrolment)).toBe(true)
  })

  it("honours the class over the term when both are set", () => {
    // A schedule carrying the wrong term but the right class term is still that
    // class's fee — classTermId is the narrower, authoritative scope.
    expect(coversEnrolment(schedule("a", { classTermId: "jss1a-term1", termId: "term2" }), enrolment)).toBe(true)
  })
})

describe("schedulesForEnrolment — who is billed", () => {
  const all = [
    schedule("tuition", { classTermId: "jss1a-term1", termId: "term1" }),
    schedule("pta", { termId: "term1" }),
    schedule("development", {}),
    schedule("other-class", { classTermId: "jss2b-term1", termId: "term1" }),
    schedule("other-term", { termId: "term2" }),
  ]

  it("bills every schedule whose scope covers the enrolment", () => {
    expect(ids(schedulesForEnrolment(all, enrolment, { isReturningStudent: false })))
      .toEqual(["tuition", "pta", "development"])
  })

  it("never bills a schedule scoped to another class or term", () => {
    const billed = ids(schedulesForEnrolment(all, enrolment, { isReturningStudent: true }))
    expect(billed).not.toContain("other-class")
    expect(billed).not.toContain("other-term")
  })
})

describe("schedulesForEnrolment — new against returning", () => {
  const admission = schedule("admission", { appliesTo: "NEW_STUDENTS" })
  const reRegistration = schedule("re-registration", { appliesTo: "RETURNING_STUDENTS" })
  const tuition = schedule("tuition", { appliesTo: "ALL_STUDENTS" })
  const all = [admission, reRegistration, tuition]

  it("charges a first-time student the admission fee, not re-registration", () => {
    expect(ids(schedulesForEnrolment(all, enrolment, { isReturningStudent: false })))
      .toEqual(["admission", "tuition"])
  })

  it("charges a returning student re-registration, not admission", () => {
    expect(ids(schedulesForEnrolment(all, enrolment, { isReturningStudent: true })))
      .toEqual(["re-registration", "tuition"])
  })

  it("applies the audience rule after the scope rule, not instead of it", () => {
    const elsewhere = [schedule("admission-jss2", { classTermId: "jss2b-term1", appliesTo: "NEW_STUDENTS" })]
    expect(schedulesForEnrolment(elsewhere, enrolment, { isReturningStudent: false })).toEqual([])
  })
})

describe("schedulesForEnrolment — nothing to do", () => {
  it("returns nothing when the school has no schedules yet", () => {
    expect(schedulesForEnrolment([], enrolment, { isReturningStudent: false })).toEqual([])
  })
})
