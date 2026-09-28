import { describe, expect, it } from "vitest"

import {
  ANY,
  countPeriodFilters,
  describePeriodFilters,
  parsePeriodFilters,
  periodFilterChips,
  reconcilePeriodFilters,
} from "./period-filters"

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

describe("parsePeriodFilters", () => {
  it("keeps the period a report is being read over", () => {
    expect(parsePeriodFilters({ sessionId: "s1", termId: "t1", classTermId: "ct1", search: " jss " })).toEqual({
      sessionId: "s1",
      termId: "t1",
      classTermId: "ct1",
      search: "jss",
    })
  })

  it("treats the select's placeholder as no filter", () => {
    expect(countPeriodFilters(parsePeriodFilters({ sessionId: ANY, termId: "" }))).toBe(0)
  })
})

describe("reconcilePeriodFilters", () => {
  it("lets the chosen term settle the session", () => {
    expect(reconcilePeriodFilters({ sessionId: "s2", termId: "t1" }, terms).sessionId).toBe("s1")
  })

  it("drops a term the school no longer has", () => {
    expect(reconcilePeriodFilters({ termId: "gone" }, terms)).toEqual({})
  })
})

describe("periodFilterChips", () => {
  it("names a term with its session, which is what the old button row could not", () => {
    expect(periodFilterChips({ termId: "t2" }, lookups).at(0)?.value).toBe("Third Term · 2024/2025")
  })

  it("does not repeat the session beside the term it belongs to", () => {
    expect(periodFilterChips({ termId: "t1", sessionId: "s1" }, lookups)).toHaveLength(1)
  })

  it("names the class rather than showing an id", () => {
    expect(periodFilterChips({ classTermId: "ct1" }, lookups).at(0)?.value).toBe("JSS 1A · Third Term")
  })
})

describe("describePeriodFilters", () => {
  it("says what a printed copy covers", () => {
    expect(describePeriodFilters({ termId: "t1", classTermId: "ct1" }, lookups)).toBe(
      "Third Term · 2025/2026 · JSS 1A · Third Term",
    )
  })

  it("says so plainly when nothing is filtered", () => {
    expect(describePeriodFilters({}, lookups)).toBe("All sessions and terms")
  })
})
