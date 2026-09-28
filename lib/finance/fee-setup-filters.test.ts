import { describe, expect, it } from "vitest"

import {
  ANY,
  categoryFilterChips,
  describeScheduleFilters,
  parseCategoryFilters,
  parseScheduleFilters,
  reconcileScheduleFilters,
  scheduleFilterChips,
} from "./fee-setup-filters"

const sessions = [
  { id: "s1", name: "2025/2026" },
  { id: "s2", name: "2024/2025" },
]
const terms = [
  { id: "t1", name: "Third Term", sessionId: "s1" },
  { id: "t2", name: "Third Term", sessionId: "s2" },
]
const categories = [{ id: "c1", name: "Examination" }]
const lookups = { sessions, terms, categories }

describe("parseCategoryFilters", () => {
  it("keeps what the filter bar submits", () => {
    expect(parseCategoryFilters({ search: " levy ", type: "OPTIONAL", status: "INACTIVE" })).toEqual({
      search: "levy",
      type: "OPTIONAL",
      status: "INACTIVE",
    })
  })

  it("drops a type or status that is not one of ours", () => {
    // The query string is public: whatever arrives must not reach the database unchecked.
    expect(parseCategoryFilters({ type: "TUITION-ISH", status: "MAYBE" })).toEqual({
      search: undefined,
      type: undefined,
      status: undefined,
    })
  })

  it("treats the select's placeholder as no filter", () => {
    expect(parseCategoryFilters({ type: ANY }).type).toBeUndefined()
  })
})

describe("parseScheduleFilters", () => {
  it("keeps every filter the schedules screen offers", () => {
    expect(
      parseScheduleFilters({
        search: "tuition",
        sessionId: "s1",
        termId: "t1",
        categoryId: "c1",
        audience: "NEW_STUDENTS",
        scope: "CLASS",
        status: "ACTIVE",
      }),
    ).toEqual({
      search: "tuition",
      sessionId: "s1",
      termId: "t1",
      categoryId: "c1",
      audience: "NEW_STUDENTS",
      scope: "CLASS",
      status: "ACTIVE",
    })
  })

  it("drops an audience or scope it does not recognise", () => {
    expect(parseScheduleFilters({ audience: "PREFECTS", scope: "WHOLE_SCHOOL" })).toMatchObject({
      audience: undefined,
      scope: undefined,
    })
  })
})

describe("reconcileScheduleFilters", () => {
  it("lets the chosen term settle the session", () => {
    expect(reconcileScheduleFilters({ sessionId: "s2", termId: "t1" }, terms).sessionId).toBe("s1")
  })

  it("drops a term the school no longer has", () => {
    expect(reconcileScheduleFilters({ termId: "gone" }, terms)).toEqual({})
  })
})

describe("categoryFilterChips", () => {
  it("reads the type as words rather than as the stored value", () => {
    expect(categoryFilterChips({ type: "REGISTRATION" })).toEqual([
      { key: "type", label: "Type", value: "Registration" },
    ])
  })

  it("quotes the search so it reads as a search and not as a category", () => {
    expect(categoryFilterChips({ search: "levy" }).at(0)?.value).toBe("“levy”")
  })
})

describe("scheduleFilterChips", () => {
  it("names a term with its session, since two sessions share the name", () => {
    expect(scheduleFilterChips({ termId: "t2" }, lookups).at(0)).toEqual({
      key: "termId",
      label: "Term",
      value: "Third Term · 2024/2025",
    })
  })

  it("does not repeat the session beside the term it belongs to", () => {
    expect(scheduleFilterChips({ termId: "t1", sessionId: "s1" }, lookups)).toHaveLength(1)
  })

  it("names the category rather than showing an id", () => {
    expect(scheduleFilterChips({ categoryId: "c1" }, lookups).at(0)?.value).toBe("Examination")
  })

  it("says how widely a schedule bills", () => {
    expect(scheduleFilterChips({ scope: "TERM" }, lookups).at(0)?.value).toBe("All classes in a term")
  })
})

describe("describeScheduleFilters", () => {
  it("says what a filtered list is a list of", () => {
    expect(describeScheduleFilters({ termId: "t1", categoryId: "c1", status: "ACTIVE" }, lookups)).toBe(
      "Third Term · 2025/2026 · Examination · Active",
    )
  })

  it("says so plainly when nothing is filtered", () => {
    expect(describeScheduleFilters({}, lookups)).toBe("All fee schedules")
  })
})
