import { describe, expect, it } from "vitest"

import {
  ANY,
  countDebtorFilters,
  debtorFilterChips,
  describeDebtorFilters,
  parseDebtorFilters,
  parseMinBalance,
  reconcileDebtorFilters,
} from "./debtor-filters"

const sessions = [
  { id: "s1", name: "2025/2026" },
  { id: "s2", name: "2024/2025" },
]
const terms = [
  { id: "t1", name: "Third Term", sessionId: "s1" },
  { id: "t2", name: "Third Term", sessionId: "s2" },
]
const classTerms = [{ id: "ct1", className: "JSS 1A", termName: "Third Term" }]
const lookups = { sessions, terms, classTerms }

describe("parseMinBalance", () => {
  it("takes a figure worth chasing", () => {
    expect(parseMinBalance("5000")).toBe(5000)
  })

  it("ignores what is not a number, so it never reaches a comparison as NaN", () => {
    expect(parseMinBalance("abc")).toBeNull()
    expect(parseMinBalance("")).toBeNull()
    expect(parseMinBalance(undefined)).toBeNull()
  })

  it("ignores zero and below, which filter nobody out", () => {
    expect(parseMinBalance("0")).toBeNull()
    expect(parseMinBalance("-100")).toBeNull()
  })
})

describe("parseDebtorFilters", () => {
  it("keeps the filters the chase list offers", () => {
    expect(
      parseDebtorFilters({
        sessionId: "s1",
        termId: "t1",
        classTermId: "ct1",
        paymentStatus: "UNPAID",
        studentType: "NEW_STUDENTS",
        minBalance: "5000",
        search: " ade ",
      }),
    ).toEqual({
      sessionId: "s1",
      termId: "t1",
      classTermId: "ct1",
      paymentStatus: "UNPAID",
      studentType: "NEW_STUDENTS",
      minBalance: "5000",
      search: "ade",
    })
  })

  it("drops a status or cohort it does not recognise", () => {
    expect(parseDebtorFilters({ paymentStatus: "SOMEDAY", studentType: "PREFECTS" })).toMatchObject({
      paymentStatus: undefined,
      studentType: undefined,
    })
  })

  it("drops a minimum that is not a usable figure", () => {
    expect(parseDebtorFilters({ minBalance: "abc" }).minBalance).toBeUndefined()
  })

  it("treats the select's placeholder as no filter", () => {
    expect(countDebtorFilters(parseDebtorFilters({ paymentStatus: ANY, classTermId: ANY }))).toBe(0)
  })
})

describe("reconcileDebtorFilters", () => {
  it("lets the chosen term settle the session", () => {
    expect(reconcileDebtorFilters({ sessionId: "s2", termId: "t1" }, terms).sessionId).toBe("s1")
  })
})

describe("debtorFilterChips", () => {
  it("names a term with its session, since two sessions share the name", () => {
    expect(debtorFilterChips({ termId: "t2" }, lookups).at(0)?.value).toBe("Third Term · 2024/2025")
  })

  it("names the class rather than showing an id", () => {
    expect(debtorFilterChips({ classTermId: "ct1" }, lookups).at(0)?.value).toBe("JSS 1A · Third Term")
  })

  it("says what a payment status means in words", () => {
    expect(debtorFilterChips({ paymentStatus: "UNPAID" }).at(0)?.value).toBe("Nothing paid")
  })

  it("shows a minimum balance as money", () => {
    expect(debtorFilterChips({ minBalance: "5000" }).at(0)).toEqual({
      key: "minBalance",
      label: "Owes at least",
      value: "NGN 5,000.00",
    })
  })
})

describe("describeDebtorFilters", () => {
  it("says what the printed list covers", () => {
    expect(describeDebtorFilters({ termId: "t1", paymentStatus: "UNPAID" }, lookups)).toBe(
      "Third Term · 2025/2026 · Nothing paid",
    )
  })

  it("says so plainly when nothing is filtered", () => {
    expect(describeDebtorFilters({}, lookups)).toBe("All sessions and terms")
  })
})
