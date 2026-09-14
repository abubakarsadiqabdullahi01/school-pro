import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { computePay, daysEmployedInMonth, type PayComponent } from "@/lib/payroll"

/**
 * Pay computation.
 *
 * A mistake here lands in somebody's bank account, so this covers the order of operations
 * rather than just the happy path: what a percentage is taken from, when proration applies,
 * and what happens when deductions exceed pay.
 */

const d = (value: string | number) => new Prisma.Decimal(value)
const n = (value: Prisma.Decimal) => Number(value.toFixed(2))

function fixed(label: string, value: string | number, extra: Partial<PayComponent> = {}): PayComponent {
  return { label, kind: "FIXED", value: d(value), ...extra }
}

function percent(label: string, value: string | number, extra: Partial<PayComponent> = {}): PayComponent {
  return { label, kind: "PERCENTAGE", value: d(value), ...extra }
}

describe("computePay — the basics", () => {
  it("pays base salary when there is nothing else", () => {
    const result = computePay({ baseSalary: d(100_000), allowances: [], deductions: [] })
    expect(n(result.grossPay)).toBe(100_000)
    expect(n(result.netPay)).toBe(100_000)
    expect(result.isNegative).toBe(false)
  })

  it("adds fixed allowances to gross", () => {
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [fixed("Transport", 15_000), fixed("Feeding", 10_000)],
      deductions: [],
    })
    expect(n(result.totalAllowances)).toBe(25_000)
    expect(n(result.grossPay)).toBe(125_000)
  })

  it("takes a percentage allowance from base salary, not from gross", () => {
    // 10% housing on a 100,000 base is 10,000 — it must not compound with the transport
    // allowance that is also being added.
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [fixed("Transport", 50_000), percent("Housing", 10)],
      deductions: [],
    })
    const housing = result.allowanceLines.find((line) => line.label === "Housing")
    expect(n(housing!.amount)).toBe(10_000)
    expect(n(result.grossPay)).toBe(160_000)
  })

  it("subtracts fixed deductions from gross", () => {
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [],
      deductions: [fixed("Union dues", 2_000, { timing: "POST_TAX" })],
    })
    expect(n(result.totalDeductions)).toBe(2_000)
    expect(n(result.netPay)).toBe(98_000)
  })
})

describe("computePay — deduction timing", () => {
  it("takes a PRE_TAX percentage from gross", () => {
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [fixed("Transport", 20_000)],
      deductions: [percent("Pension", 8, { timing: "PRE_TAX" })],
    })
    // 8% of the 120,000 gross.
    expect(n(result.deductionLines[0].amount)).toBe(9_600)
    expect(n(result.taxableBase)).toBe(110_400)
  })

  it("takes a POST_TAX percentage from gross less the PRE_TAX deductions", () => {
    // This is the whole point of the two timings: PAYE is worked out after pension.
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [],
      deductions: [
        percent("Pension", 8, { timing: "PRE_TAX" }),
        percent("PAYE", 10, { timing: "POST_TAX" }),
      ],
    })
    expect(n(result.taxableBase)).toBe(92_000)
    const paye = result.deductionLines.find((line) => line.label === "PAYE")
    expect(n(paye!.amount)).toBe(9_200)
    expect(n(result.totalDeductions)).toBe(17_200)
    expect(n(result.netPay)).toBe(82_800)
  })

  it("treats a deduction with no timing as POST_TAX", () => {
    const withoutTiming = computePay({
      baseSalary: d(100_000),
      allowances: [],
      deductions: [percent("Levy", 5)],
    })
    const explicit = computePay({
      baseSalary: d(100_000),
      allowances: [],
      deductions: [percent("Levy", 5, { timing: "POST_TAX" })],
    })
    expect(n(withoutTiming.netPay)).toBe(n(explicit.netPay))
  })

  it("lists PRE_TAX deductions before POST_TAX ones, so a payslip reads in order", () => {
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [],
      deductions: [
        fixed("Cooperative", 3_000, { timing: "POST_TAX" }),
        fixed("Pension", 8_000, { timing: "PRE_TAX" }),
      ],
    })
    expect(result.deductionLines.map((line) => line.label)).toEqual(["Pension", "Cooperative"])
  })
})

describe("computePay — proration", () => {
  it("pays a part month pro rata", () => {
    const result = computePay({
      baseSalary: d(120_000),
      allowances: [],
      deductions: [],
      daysWorked: 15,
      daysInMonth: 30,
    })
    expect(n(result.baseSalary)).toBe(60_000)
    expect(result.proratedDays).toBe(15)
    expect(result.daysInMonth).toBe(30)
  })

  it("scales percentage allowances with the prorated base", () => {
    const result = computePay({
      baseSalary: d(120_000),
      allowances: [percent("Housing", 10)],
      deductions: [],
      daysWorked: 15,
      daysInMonth: 30,
    })
    // 10% of the prorated 60,000, not of the full 120,000.
    expect(n(result.allowanceLines[0].amount)).toBe(6_000)
    expect(n(result.grossPay)).toBe(66_000)
  })

  it("does not prorate a full month", () => {
    const result = computePay({
      baseSalary: d(120_000),
      allowances: [],
      deductions: [],
      daysWorked: 30,
      daysInMonth: 30,
    })
    expect(n(result.baseSalary)).toBe(120_000)
    expect(result.proratedDays).toBeNull()
  })

  it("ignores a daysWorked above the month length rather than inflating pay", () => {
    const result = computePay({
      baseSalary: d(120_000),
      allowances: [],
      deductions: [],
      daysWorked: 45,
      daysInMonth: 30,
    })
    expect(n(result.baseSalary)).toBe(120_000)
  })
})

describe("computePay — negative net", () => {
  it("reports a negative net rather than silently clamping it to zero", () => {
    // Clamping would hide a misconfigured deduction, which is exactly the thing the caller
    // needs to be told about.
    const result = computePay({
      baseSalary: d(50_000),
      allowances: [],
      deductions: [fixed("Runaway loan", 80_000, { timing: "POST_TAX" })],
    })
    expect(n(result.netPay)).toBe(-30_000)
    expect(result.isNegative).toBe(true)
  })

  it("does not flag an exactly zero net as negative", () => {
    const result = computePay({
      baseSalary: d(50_000),
      allowances: [],
      deductions: [fixed("Full recovery", 50_000, { timing: "POST_TAX" })],
    })
    expect(n(result.netPay)).toBe(0)
    expect(result.isNegative).toBe(false)
  })
})

describe("computePay — rounding", () => {
  it("rounds every figure to kobo", () => {
    // A third of 100,000 is not representable, so the line must still land on two places.
    const result = computePay({
      baseSalary: d(100_000),
      allowances: [percent("Odd", "33.333")],
      deductions: [],
    })
    expect(result.allowanceLines[0].amount.decimalPlaces()).toBeLessThanOrEqual(2)
    expect(result.grossPay.decimalPlaces()).toBeLessThanOrEqual(2)
    expect(result.netPay.decimalPlaces()).toBeLessThanOrEqual(2)
  })

  it("keeps gross equal to base plus allowances after rounding", () => {
    const result = computePay({
      baseSalary: d("33333.33"),
      allowances: [percent("A", "7.5"), percent("B", "2.5")],
      deductions: [],
    })
    expect(n(result.grossPay)).toBeCloseTo(n(result.baseSalary) + n(result.totalAllowances), 2)
  })
})

describe("daysEmployedInMonth", () => {
  const monthStart = new Date(Date.UTC(2026, 3, 1))
  const monthEnd = new Date(Date.UTC(2026, 4, 0, 23, 59, 59, 999))
  const daysInMonth = 30

  it("counts a whole month for somebody employed before it started", () => {
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2020, 0, 1)),
      }),
    ).toBe(30)
  })

  it("counts from the start date for a mid-month joiner, inclusively", () => {
    // Employed on the 16th of a 30-day month: the 16th through the 30th is 15 days.
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2026, 3, 16)),
      }),
    ).toBe(15)
  })

  it("stops at the exit date, inclusively", () => {
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2020, 0, 1)),
        dateExited: new Date(Date.UTC(2026, 3, 10)),
      }),
    ).toBe(10)
  })

  it("returns zero for somebody who left before the month began", () => {
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2020, 0, 1)),
        dateExited: new Date(Date.UTC(2026, 2, 15)),
      }),
    ).toBe(0)
  })

  it("returns zero for somebody employed after the month ended", () => {
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2026, 5, 1)),
      }),
    ).toBe(0)
  })

  it("counts a single day for somebody who joined and left on the same day", () => {
    expect(
      daysEmployedInMonth({
        monthStart,
        monthEnd,
        daysInMonth,
        dateEmployed: new Date(Date.UTC(2026, 3, 12)),
        dateExited: new Date(Date.UTC(2026, 3, 12)),
      }),
    ).toBe(1)
  })
})
