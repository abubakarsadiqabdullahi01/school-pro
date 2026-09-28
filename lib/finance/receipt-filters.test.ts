import { describe, expect, it } from "vitest"

import {
  ANY,
  countActiveFilters,
  describeReceiptFilters,
  parseReceiptFilters,
  receiptFilterChips,
  receiptFilterHref,
  reconcilePeriod,
} from "./receipt-filters"

const sessions = [
  { id: "s1", name: "2025/2026" },
  { id: "s2", name: "2024/2025" },
]
const terms = [
  { id: "t1", name: "Third Term", sessionId: "s1" },
  { id: "t2", name: "Third Term", sessionId: "s2" },
]
const cashiers = [{ id: "u1", name: "Bashir Garba" }]
const lookups = { sessions, terms, cashiers }

describe("parseReceiptFilters", () => {
  it("keeps the values a filter bar actually submits", () => {
    expect(
      parseReceiptFilters({
        sessionId: "s1",
        termId: "t1",
        method: "BANK_TRANSFER",
        status: "PENDING",
        cashierId: "u1",
        from: "2026-09-01",
        to: "2026-09-30",
        search: " RCT/2026 ",
      }),
    ).toEqual({
      sessionId: "s1",
      termId: "t1",
      method: "BANK_TRANSFER",
      status: "PENDING",
      cashierId: "u1",
      from: "2026-09-01",
      to: "2026-09-30",
      search: "RCT/2026",
    })
  })

  it("treats the select's placeholder and blank text as no filter", () => {
    const filters = parseReceiptFilters({ method: ANY, status: "", search: "   ", termId: undefined })
    expect(countActiveFilters(filters)).toBe(0)
  })

  it("drops a method or status that is not one of ours", () => {
    // The query string is public: whatever arrives must not reach the database unchecked.
    const filters = parseReceiptFilters({ method: "CRYPTO", status: "DROP TABLE" })
    expect(filters.method).toBeUndefined()
    expect(filters.status).toBeUndefined()
  })

  it("ignores a date that is not a date", () => {
    expect(parseReceiptFilters({ from: "yesterday", to: "2026-02-31" })).toMatchObject({
      from: undefined,
      to: undefined,
    })
  })

  it("turns a range typed backwards the right way round", () => {
    expect(parseReceiptFilters({ from: "2026-09-30", to: "2026-09-01" })).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    })
  })
})

describe("reconcilePeriod", () => {
  it("lets the chosen term settle the session, so the two cannot contradict", () => {
    expect(reconcilePeriod({ sessionId: "s2", termId: "t1" }, terms).sessionId).toBe("s1")
  })

  it("drops a term the school does not have", () => {
    expect(reconcilePeriod({ termId: "gone" }, terms)).toEqual({})
  })

  it("leaves a session-only filter alone", () => {
    expect(reconcilePeriod({ sessionId: "s2" }, terms)).toEqual({ sessionId: "s2" })
  })
})

describe("receiptFilterChips", () => {
  it("names a term with its session, since two sessions share the name", () => {
    const [chip] = receiptFilterChips({ termId: "t2", sessionId: "s2" }, lookups)
    expect(chip).toEqual({ key: "termId", label: "Term", value: "Third Term · 2024/2025" })
  })

  it("does not repeat the session beside the term it belongs to", () => {
    expect(receiptFilterChips({ termId: "t1", sessionId: "s1" }, lookups)).toHaveLength(1)
  })

  it("keeps a date range as one chip, because half a range is nobody's intent", () => {
    const chips = receiptFilterChips({ from: "2026-09-01", to: "2026-09-30" }, lookups)
    expect(chips).toEqual([{ key: "from", label: "Dates", value: "01 Sep 2026 – 30 Sep 2026" }])
  })

  it("says which end of an open range is set", () => {
    expect(receiptFilterChips({ from: "2026-09-01" }).at(0)?.value).toBe("From 01 Sep 2026")
    expect(receiptFilterChips({ to: "2026-09-30" }).at(0)?.value).toBe("Up to 30 Sep 2026")
  })

  it("names the cashier rather than showing an id", () => {
    expect(receiptFilterChips({ cashierId: "u1" }, lookups).at(0)?.value).toBe("Bashir Garba")
  })
})

describe("describeReceiptFilters", () => {
  it("says what the printed page is a list of", () => {
    expect(
      describeReceiptFilters({ termId: "t1", method: "CASH", from: "2026-09-01", to: "2026-09-30" }, lookups),
    ).toBe("Third Term · 2025/2026 · Cash · 01 Sep 2026 – 30 Sep 2026")
  })

  it("says so plainly when nothing is filtered", () => {
    expect(describeReceiptFilters({}, lookups)).toBe("All receipts")
  })
})

describe("receiptFilterHref", () => {
  it("carries the other filters when one changes", () => {
    expect(receiptFilterHref("/receipts", { termId: "t1", method: "CASH" }, { method: "POS" })).toBe(
      "/receipts?termId=t1&method=POS",
    )
  })

  it("clears the whole range when the range chip is removed", () => {
    expect(receiptFilterHref("/receipts", { from: "2026-09-01", to: "2026-09-30" }, { from: undefined })).toBe(
      "/receipts",
    )
  })

  it("returns the bare path once nothing is left", () => {
    expect(receiptFilterHref("/receipts", { search: "x" }, { search: undefined })).toBe("/receipts")
  })
})
