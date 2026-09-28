import { describe, expect, it } from "vitest"

import {
  canGeneratePayroll,
  generatablePeriods,
  payrollPeriodLabel,
  periodIndex,
  type PayrollRunSummary,
} from "@/lib/hr/payroll-period-rules"

const today = { year: 2026, month: 9 }

const runs: PayrollRunSummary[] = [
  { year: 2026, month: 9, status: "APPROVED" },
  { year: 2026, month: 8, status: "PAID" },
  { year: 2026, month: 6, status: "PAID" },
]

describe("payrollPeriodLabel", () => {
  it("reads as a person would say it", () => {
    expect(payrollPeriodLabel({ year: 2026, month: 9 })).toBe("September 2026")
    expect(payrollPeriodLabel({ year: 2026, month: 1 })).toBe("January 2026")
  })

  it("does not crash on a month outside the calendar", () => {
    expect(payrollPeriodLabel({ year: 2026, month: 13 })).toBe("Month 13 2026")
  })
})

describe("periodIndex", () => {
  it("orders months across a year boundary", () => {
    expect(periodIndex({ year: 2026, month: 1 })).toBeGreaterThan(periodIndex({ year: 2025, month: 12 }))
  })

  it("is one apart for consecutive months", () => {
    expect(periodIndex({ year: 2026, month: 9 }) - periodIndex({ year: 2026, month: 8 })).toBe(1)
  })
})

describe("canGeneratePayroll", () => {
  it("refuses a month that has not started", () => {
    const verdict = canGeneratePayroll({ year: 2026, month: 10 }, { existing: runs, today })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("October 2026 has not started yet")
  })

  it("refuses a month years ahead, which the year select happily offers", () => {
    const verdict = canGeneratePayroll({ year: 2029, month: 1 }, { existing: runs, today })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("not started yet")
  })

  it("allows the current month when it has no run", () => {
    expect(canGeneratePayroll({ year: 2026, month: 9 }, { existing: [], today })).toEqual({ allowed: true })
  })

  it("refuses a month that already has a run, and names what became of it", () => {
    const verdict = canGeneratePayroll({ year: 2026, month: 9 }, { existing: runs, today })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("already been generated and is approved")
  })

  it("refuses a paid month in the same words", () => {
    const verdict = canGeneratePayroll({ year: 2026, month: 8 }, { existing: runs, today })
    expect(verdict.allowed === false && verdict.reason).toContain("is paid")
  })

  it("refuses a month whose run was cancelled — a month is generated once", () => {
    const cancelled: PayrollRunSummary[] = [{ year: 2026, month: 7, status: "CANCELLED" }]
    const verdict = canGeneratePayroll({ year: 2026, month: 7 }, { existing: cancelled, today })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("cancelled")
    expect(verdict.allowed === false && verdict.reason).toContain("generated once")
  })

  it("refuses a draft month, so an unfinished run is not generated over", () => {
    const draft: PayrollRunSummary[] = [{ year: 2026, month: 9, status: "DRAFT" }]
    const verdict = canGeneratePayroll({ year: 2026, month: 9 }, { existing: draft, today })
    expect(verdict.allowed === false && verdict.reason).toContain("still a draft")
  })

  it("allows filling a gap behind the latest run, with a warning", () => {
    const verdict = canGeneratePayroll({ year: 2026, month: 7 }, { existing: runs, today })
    expect(verdict.allowed).toBe(true)
    expect(verdict.allowed === true && verdict.note).toContain("earlier than September 2026")
  })

  it("says nothing extra when the month is the newest one being generated", () => {
    const earlier: PayrollRunSummary[] = [{ year: 2026, month: 8, status: "PAID" }]
    expect(canGeneratePayroll({ year: 2026, month: 9 }, { existing: earlier, today })).toEqual({
      allowed: true,
    })
  })

  it("allows a gap in a previous year", () => {
    const verdict = canGeneratePayroll({ year: 2025, month: 11 }, { existing: runs, today })
    expect(verdict.allowed).toBe(true)
    expect(verdict.allowed === true && verdict.note).toBeTruthy()
  })

  it("has no opinion about gaps when nothing has been run yet", () => {
    expect(canGeneratePayroll({ year: 2026, month: 3 }, { existing: [], today })).toEqual({ allowed: true })
  })
})

describe("generatablePeriods", () => {
  it("offers the months that are still free, newest first", () => {
    const periods = generatablePeriods({ existing: runs, today }, 6)

    expect(periods).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 5 },
      { year: 2026, month: 4 },
    ])
  })

  it("never offers a future month", () => {
    const periods = generatablePeriods({ existing: [], today }, 3)
    expect(periods[0]).toEqual({ year: 2026, month: 9 })
    expect(periods.every((period) => period.year <= 2026)).toBe(true)
  })

  it("crosses a year boundary correctly", () => {
    const periods = generatablePeriods({ existing: [], today: { year: 2026, month: 2 } }, 4)

    expect(periods).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
      { year: 2025, month: 11 },
    ])
  })

  it("returns nothing when every month in the horizon is taken", () => {
    const every: PayrollRunSummary[] = [
      { year: 2026, month: 9, status: "PAID" },
      { year: 2026, month: 8, status: "PAID" },
    ]
    expect(generatablePeriods({ existing: every, today }, 2)).toEqual([])
  })
})

describe("a school mid-year with an unbroken run", () => {
  // Brightfield's actual position in September 2026: paid every month from December 2025,
  // with September approved but not yet paid.
  const unbroken: PayrollRunSummary[] = [
    { year: 2025, month: 12, status: "PAID" },
    ...Array.from({ length: 8 }, (_, index) => ({
      year: 2026,
      month: index + 1,
      status: "PAID" as const,
    })),
    { year: 2026, month: 9, status: "APPROVED" },
  ]
  const facts = { existing: unbroken, today }

  it("leaves no month of 2026 generatable — nine are run and three have not started", () => {
    const open = Array.from({ length: 12 }, (_, index) => index + 1).filter(
      (month) => canGeneratePayroll({ year: 2026, month }, facts).allowed,
    )

    expect(open).toEqual([])
  })

  it("still allows the months of 2025 that were never run", () => {
    expect(canGeneratePayroll({ year: 2025, month: 11 }, facts).allowed).toBe(true)
    expect(canGeneratePayroll({ year: 2025, month: 12 }, facts).allowed).toBe(false)
  })

  it("offers nothing when asked for the free months in the last year", () => {
    expect(generatablePeriods(facts, 10)).toEqual([])
  })
})
