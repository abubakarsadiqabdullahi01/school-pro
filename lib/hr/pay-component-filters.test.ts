import { describe, expect, it } from "vitest"

import {
  componentKindLabel,
  componentValueLabel,
  countPayComponentFilters,
  deductionTimingLabel,
  describePayComponentFilters,
  matchesPayComponent,
  parsePayComponentFilters,
  payComponentChips,
  payComponentFilterHref,
} from "@/lib/hr/pay-component-filters"

describe("parsePayComponentFilters", () => {
  it("reads every filter the three screens offer between them", () => {
    expect(
      parsePayComponentFilters({
        search: "housing",
        status: "ACTIVE",
        kind: "PERCENTAGE",
        timing: "PRE_TAX",
        usage: "IN_USE",
      }),
    ).toEqual({
      search: "housing",
      status: "ACTIVE",
      kind: "PERCENTAGE",
      timing: "PRE_TAX",
      usage: "IN_USE",
    })
  })

  it("drops values that are not offered, because the query string is public", () => {
    expect(parsePayComponentFilters({ status: "DELETED", kind: "SOMETIMES", timing: "MAYBE" })).toEqual({
      search: undefined,
      status: undefined,
      kind: undefined,
      timing: undefined,
      usage: undefined,
    })
  })

  it("treats the no-filter sentinel and blank input as absent", () => {
    expect(parsePayComponentFilters({ search: "  ", kind: "ANY" })).toMatchObject({
      search: undefined,
      kind: undefined,
    })
  })
})

describe("countPayComponentFilters", () => {
  it("counts only the filters that are on", () => {
    expect(countPayComponentFilters({})).toBe(0)
    expect(countPayComponentFilters({ status: "ACTIVE", usage: "UNUSED" })).toBe(2)
  })
})

describe("payComponentFilterHref", () => {
  it("keeps the other filters when one changes", () => {
    expect(payComponentFilterHref("/allowances", { status: "ACTIVE", kind: "FIXED" }, { kind: "PERCENTAGE" })).toBe(
      "/allowances?status=ACTIVE&kind=PERCENTAGE",
    )
  })

  it("clears one filter without losing the rest", () => {
    expect(payComponentFilterHref("/allowances", { status: "ACTIVE", kind: "FIXED" }, { status: undefined })).toBe(
      "/allowances?kind=FIXED",
    )
  })

  it("returns the bare path when nothing is filtered", () => {
    expect(payComponentFilterHref("/allowances", {})).toBe("/allowances")
  })
})

describe("payComponentChips", () => {
  it("names each filter in the words the select used", () => {
    expect(payComponentChips({ kind: "PERCENTAGE", timing: "PRE_TAX", usage: "UNUSED" })).toEqual([
      { key: "kind", label: "Type", value: "Percentage" },
      { key: "timing", label: "Applies", value: "Before tax" },
      { key: "usage", label: "Use", value: "Nobody on it" },
    ])
  })

  it("has nothing to show when nothing is filtered", () => {
    expect(payComponentChips({})).toEqual([])
  })
})

describe("describePayComponentFilters", () => {
  it("names the whole list in the words of the screen", () => {
    expect(describePayComponentFilters({}, "allowances")).toBe("All allowances")
    expect(describePayComponentFilters({}, "salary scales")).toBe("All salary scales")
  })

  it("joins the active filters", () => {
    expect(describePayComponentFilters({ status: "RETIRED", usage: "UNUSED" }, "deductions")).toBe(
      "Status: Retired · Use: Nobody on it",
    )
  })
})

describe("labels", () => {
  it("reads a kind and a timing back as their labels", () => {
    expect(componentKindLabel("FIXED")).toBe("Fixed amount")
    expect(deductionTimingLabel("PRE_TAX")).toBe("Before tax")
  })

  it("falls back to the code, so an unknown value is still legible", () => {
    expect(componentKindLabel("BANDED")).toBe("BANDED")
  })

  it("never shows a percentage as if it were naira", () => {
    const money = (value: string) => `NGN${Number(value).toLocaleString()}`
    expect(componentValueLabel("PERCENTAGE", "20", money)).toBe("20%")
    expect(componentValueLabel("FIXED", "15000", money)).toBe("NGN15,000")
  })
})

describe("matchesPayComponent", () => {
  const housing = { isActive: true, kind: "PERCENTAGE", assignedCount: 12 }
  const retiredFixed = { isActive: false, kind: "FIXED", assignedCount: 0 }
  const pension = { isActive: true, kind: "PERCENTAGE", timing: "PRE_TAX", assignedCount: 12 }
  const paye = { isActive: true, kind: "PERCENTAGE", timing: "POST_TAX", assignedCount: 12 }

  it("passes everything when nothing is filtered", () => {
    expect(matchesPayComponent(housing, {})).toBe(true)
    expect(matchesPayComponent(retiredFixed, {})).toBe(true)
  })

  it("separates active from retired", () => {
    expect(matchesPayComponent(housing, { status: "ACTIVE" })).toBe(true)
    expect(matchesPayComponent(retiredFixed, { status: "ACTIVE" })).toBe(false)
    expect(matchesPayComponent(retiredFixed, { status: "RETIRED" })).toBe(true)
  })

  it("separates a percentage from a fixed amount", () => {
    expect(matchesPayComponent(housing, { kind: "PERCENTAGE" })).toBe(true)
    expect(matchesPayComponent(housing, { kind: "FIXED" })).toBe(false)
  })

  it("separates before-tax from after-tax deductions", () => {
    expect(matchesPayComponent(pension, { timing: "PRE_TAX" })).toBe(true)
    expect(matchesPayComponent(paye, { timing: "PRE_TAX" })).toBe(false)
  })

  it("finds the ones nobody is on", () => {
    expect(matchesPayComponent(retiredFixed, { usage: "UNUSED" })).toBe(true)
    expect(matchesPayComponent(housing, { usage: "UNUSED" })).toBe(false)
    expect(matchesPayComponent(housing, { usage: "IN_USE" })).toBe(true)
  })

  it("ignores a timing filter on a row that has no timing, such as a scale", () => {
    expect(matchesPayComponent({ isActive: true, assignedCount: 3 }, { timing: "PRE_TAX" })).toBe(false)
  })

  it("requires every active filter to agree", () => {
    expect(matchesPayComponent(pension, { status: "ACTIVE", kind: "PERCENTAGE", timing: "PRE_TAX" })).toBe(true)
    expect(matchesPayComponent(pension, { status: "RETIRED", kind: "PERCENTAGE" })).toBe(false)
  })
})
