import { describe, expect, it } from "vitest"

import {
  countPaymentAccountFilters,
  describePaymentAccountFilters,
  matchesDerivedFilters,
  parsePaymentAccountFilters,
  paymentAccountChips,
  paymentAccountFilterHref,
  paymentAccountTypeLabel,
} from "@/lib/expenditure/payment-account-filters"

describe("parsePaymentAccountFilters", () => {
  it("reads every filter the screen offers", () => {
    const filters = parsePaymentAccountFilters({
      search: "zenith",
      type: "BANK",
      status: "ACTIVE",
      balance: "OVERDRAWN",
      activity: "USED",
    })

    expect(filters).toEqual({
      search: "zenith",
      type: "BANK",
      status: "ACTIVE",
      balance: "OVERDRAWN",
      activity: "USED",
    })
  })

  it("drops values that are not offered, because the query string is public", () => {
    const filters = parsePaymentAccountFilters({
      type: "CRYPTO",
      status: "SUSPENDED",
      balance: "HUGE",
      activity: "SOMETIMES",
    })

    expect(filters).toEqual({
      search: undefined,
      type: undefined,
      status: undefined,
      balance: undefined,
      activity: undefined,
    })
  })

  it("treats the no-filter sentinel and blank input as absent", () => {
    expect(parsePaymentAccountFilters({ search: "   ", type: "ANY" })).toMatchObject({
      search: undefined,
      type: undefined,
    })
  })

  it("takes the first value when a parameter is repeated", () => {
    expect(parsePaymentAccountFilters({ type: ["BANK", "CASH"] }).type).toBe("BANK")
  })
})

describe("countPaymentAccountFilters", () => {
  it("counts only the filters that are on", () => {
    expect(countPaymentAccountFilters({})).toBe(0)
    expect(countPaymentAccountFilters({ type: "BANK", status: "ACTIVE" })).toBe(2)
  })
})

describe("paymentAccountFilterHref", () => {
  it("keeps the other filters when one changes", () => {
    const href = paymentAccountFilterHref("/chart", { type: "BANK", status: "ACTIVE" }, { status: "CLOSED" })
    expect(href).toBe("/chart?type=BANK&status=CLOSED")
  })

  it("clears one filter without losing the rest", () => {
    const href = paymentAccountFilterHref("/chart", { type: "BANK", status: "ACTIVE" }, { type: undefined })
    expect(href).toBe("/chart?status=ACTIVE")
  })

  it("returns the bare path when nothing is filtered", () => {
    expect(paymentAccountFilterHref("/chart", {})).toBe("/chart")
  })
})

describe("paymentAccountChips", () => {
  it("names each filter in the words the select used", () => {
    const chips = paymentAccountChips({ type: "BANK", balance: "OVERDRAWN", activity: "UNUSED" })

    expect(chips).toEqual([
      { key: "type", label: "Type", value: "Bank account" },
      { key: "balance", label: "Balance", value: "Overdrawn" },
      { key: "activity", label: "Use", value: "Never used" },
    ])
  })

  it("has nothing to show when nothing is filtered", () => {
    expect(paymentAccountChips({})).toEqual([])
  })
})

describe("describePaymentAccountFilters", () => {
  it("says so plainly when the whole chart is on screen", () => {
    expect(describePaymentAccountFilters({})).toBe("All accounts")
  })

  it("joins the active filters", () => {
    expect(describePaymentAccountFilters({ status: "CLOSED", type: "CASH" })).toBe(
      "Type: Cash · Status: Closed",
    )
  })
})

describe("paymentAccountTypeLabel", () => {
  it("reads a stored code back as its label", () => {
    expect(paymentAccountTypeLabel("BANK")).toBe("Bank account")
  })

  it("falls back to the code itself, so an unknown type is still legible", () => {
    expect(paymentAccountTypeLabel("MOBILE")).toBe("MOBILE")
  })
})

describe("matchesDerivedFilters", () => {
  const overdrawn = { balance: "-273000.00", paidCount: 4 }
  const funded = { balance: "150000.00", paidCount: 2 }
  const emptyAndUnused = { balance: "0.00", paidCount: 0 }

  it("passes everything when neither derived filter is on", () => {
    expect(matchesDerivedFilters(overdrawn, {})).toBe(true)
    expect(matchesDerivedFilters(emptyAndUnused, {})).toBe(true)
  })

  it("finds the overdrawn accounts", () => {
    expect(matchesDerivedFilters(overdrawn, { balance: "OVERDRAWN" })).toBe(true)
    expect(matchesDerivedFilters(funded, { balance: "OVERDRAWN" })).toBe(false)
    expect(matchesDerivedFilters(emptyAndUnused, { balance: "OVERDRAWN" })).toBe(false)
  })

  it("treats a zero balance as empty rather than in funds", () => {
    expect(matchesDerivedFilters(emptyAndUnused, { balance: "IN_FUNDS" })).toBe(false)
    expect(matchesDerivedFilters(emptyAndUnused, { balance: "EMPTY" })).toBe(true)
    expect(matchesDerivedFilters(funded, { balance: "EMPTY" })).toBe(false)
  })

  it("counts a rejected voucher as never used, because no money left", () => {
    const rejectedOnly = { balance: "50000.00", paidCount: 0 }
    expect(matchesDerivedFilters(rejectedOnly, { activity: "UNUSED" })).toBe(true)
    expect(matchesDerivedFilters(rejectedOnly, { activity: "USED" })).toBe(false)
  })

  it("separates the accounts in use from the ones nothing has left", () => {
    expect(matchesDerivedFilters(funded, { activity: "USED" })).toBe(true)
    expect(matchesDerivedFilters(emptyAndUnused, { activity: "USED" })).toBe(false)
    expect(matchesDerivedFilters(emptyAndUnused, { activity: "UNUSED" })).toBe(true)
  })

  it("requires both derived filters to agree", () => {
    expect(matchesDerivedFilters(overdrawn, { balance: "OVERDRAWN", activity: "USED" })).toBe(true)
    expect(matchesDerivedFilters(overdrawn, { balance: "OVERDRAWN", activity: "UNUSED" })).toBe(false)
  })
})
