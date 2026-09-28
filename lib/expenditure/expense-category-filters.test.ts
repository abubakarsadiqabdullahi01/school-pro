import { describe, expect, it } from "vitest"

import {
  budgetUsedPercent,
  countExpenseCategoryFilters,
  describeExpenseCategoryFilters,
  expenseCategoryChips,
  expenseCategoryFilterHref,
  matchesCategoryUsage,
  parseExpenseCategoryFilters,
} from "@/lib/expenditure/expense-category-filters"

describe("parseExpenseCategoryFilters", () => {
  it("reads every filter the screen offers", () => {
    expect(
      parseExpenseCategoryFilters({ search: "utilities", status: "ACTIVE", budget: "OVER", usage: "USED" }),
    ).toEqual({ search: "utilities", status: "ACTIVE", budget: "OVER", usage: "USED" })
  })

  it("drops values that are not offered, because the query string is public", () => {
    expect(parseExpenseCategoryFilters({ status: "DELETED", budget: "HUGE", usage: "MAYBE" })).toEqual({
      search: undefined,
      status: undefined,
      budget: undefined,
      usage: undefined,
    })
  })

  it("treats the no-filter sentinel and blank input as absent", () => {
    expect(parseExpenseCategoryFilters({ search: "  ", status: "ANY" })).toEqual({
      search: undefined,
      status: undefined,
      budget: undefined,
      usage: undefined,
    })
  })
})

describe("countExpenseCategoryFilters", () => {
  it("counts only the filters that are on", () => {
    expect(countExpenseCategoryFilters({})).toBe(0)
    expect(countExpenseCategoryFilters({ status: "ACTIVE", usage: "UNUSED" })).toBe(2)
  })
})

describe("expenseCategoryFilterHref", () => {
  it("keeps the other filters when one changes", () => {
    expect(expenseCategoryFilterHref("/cats", { status: "ACTIVE", usage: "USED" }, { usage: "UNUSED" })).toBe(
      "/cats?status=ACTIVE&usage=UNUSED",
    )
  })

  it("clears one filter without losing the rest", () => {
    expect(expenseCategoryFilterHref("/cats", { status: "ACTIVE", usage: "USED" }, { status: undefined })).toBe(
      "/cats?usage=USED",
    )
  })

  it("returns the bare path when nothing is filtered", () => {
    expect(expenseCategoryFilterHref("/cats", {})).toBe("/cats")
  })
})

describe("expenseCategoryChips", () => {
  it("names each filter in the words the select used", () => {
    expect(expenseCategoryChips({ status: "RETIRED", budget: "OVER" })).toEqual([
      { key: "status", label: "Status", value: "Retired" },
      { key: "budget", label: "Budget", value: "Over this term" },
    ])
  })

  it("has nothing to show when nothing is filtered", () => {
    expect(expenseCategoryChips({})).toEqual([])
  })
})

describe("describeExpenseCategoryFilters", () => {
  it("says so plainly when the whole list is on screen", () => {
    expect(describeExpenseCategoryFilters({})).toBe("All categories")
  })

  it("joins the active filters", () => {
    expect(describeExpenseCategoryFilters({ status: "ACTIVE", usage: "UNUSED" })).toBe(
      "Status: Active · Use: Never used",
    )
  })
})

describe("budgetUsedPercent", () => {
  it("reports how much of a ceiling is gone", () => {
    expect(budgetUsedPercent("500000.00", "310000.00")).toBe(62)
  })

  it("goes past 100 rather than clamping, because over budget is the point", () => {
    expect(budgetUsedPercent("500000.00", "830000.00")).toBe(166)
  })

  it("has no answer for a category with no ceiling", () => {
    expect(budgetUsedPercent(null, "310000.00")).toBeNull()
    expect(budgetUsedPercent("0", "310000.00")).toBeNull()
  })
})

describe("matchesCategoryUsage", () => {
  const over = { budgetLimit: "500000.00", termSpend: "830000.00", expenseCount: 4 }
  const within = { budgetLimit: "500000.00", termSpend: "310000.00", expenseCount: 2 }
  const unlimited = { budgetLimit: null, termSpend: "17017495.20", expenseCount: 9 }
  const unused = { budgetLimit: "400000.00", termSpend: "0.00", expenseCount: 0 }

  it("passes everything when neither derived filter is on", () => {
    expect(matchesCategoryUsage(over, {})).toBe(true)
    expect(matchesCategoryUsage(unlimited, {})).toBe(true)
  })

  it("finds the categories over their ceiling this term", () => {
    expect(matchesCategoryUsage(over, { budget: "OVER" })).toBe(true)
    expect(matchesCategoryUsage(within, { budget: "OVER" })).toBe(false)
  })

  it("never calls an unlimited category over budget, however much it spent", () => {
    expect(matchesCategoryUsage(unlimited, { budget: "OVER" })).toBe(false)
  })

  it("treats spending exactly the limit as within it", () => {
    expect(matchesCategoryUsage({ ...within, termSpend: "500000.00" }, { budget: "OVER" })).toBe(false)
  })

  it("separates the categories in use from the ones nothing was charged to", () => {
    expect(matchesCategoryUsage(within, { usage: "USED" })).toBe(true)
    expect(matchesCategoryUsage(unused, { usage: "USED" })).toBe(false)
    expect(matchesCategoryUsage(unused, { usage: "UNUSED" })).toBe(true)
  })

  it("requires both derived filters to agree", () => {
    expect(matchesCategoryUsage(over, { budget: "OVER", usage: "USED" })).toBe(true)
    expect(matchesCategoryUsage(over, { budget: "OVER", usage: "UNUSED" })).toBe(false)
  })
})
