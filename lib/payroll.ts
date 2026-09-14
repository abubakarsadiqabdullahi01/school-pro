import { Prisma } from "@prisma/client"

/**
 * The pay computation, kept pure.
 *
 * This is the one piece of the HR module where a mistake shows up in somebody's bank
 * account, so it lives here rather than inside a server action: no database, no session, no
 * `revalidatePath` — just figures in and figures out, which means it can be tested
 * exhaustively in the database-free suite.
 *
 * The order of operations, which is the part that is easy to get wrong:
 *
 *   1. Base salary is prorated first, if the staff member did not work the whole month.
 *   2. Allowances are computed against the **prorated base**. A percentage housing
 *      allowance for somebody who worked half a month is half as much.
 *   3. Gross = prorated base + allowances.
 *   4. PRE_TAX deductions are computed against **gross**. Pension is the usual case.
 *   5. Taxable base = gross − PRE_TAX deductions. This is what PAYE should be worked out on,
 *      which is the whole reason the two timings exist.
 *   6. POST_TAX deductions are computed against the **taxable base**.
 *   7. Net = gross − all deductions.
 *
 * Deductions never take net below zero here. Clamping silently would hide a misconfigured
 * deduction, so the raw figure is returned and the caller decides — `isNegative` is provided
 * so it does not have to re-derive that.
 */

export type ComponentKind = "FIXED" | "PERCENTAGE"
export type DeductionTiming = "PRE_TAX" | "POST_TAX"

/** An allowance or deduction as configured, before it is turned into an amount. */
export type PayComponent = {
  label: string
  kind: ComponentKind
  /** Naira when FIXED; a percentage when PERCENTAGE. */
  value: Prisma.Decimal
  /** Allowances only. Carried onto the payslip line for the record. */
  isTaxable?: boolean
  /** Deductions only. Decides which figure the percentage is taken from. */
  timing?: DeductionTiming
  /** Which configuration row produced this, for tracing on the payslip. */
  sourceType?: string
  sourceId?: string
}

/** One line as it will appear on the payslip, with the amount already worked out. */
export type ComputedLine = {
  label: string
  amount: Prisma.Decimal
  isTaxable?: boolean
  timing?: DeductionTiming
  sourceType?: string
  sourceId?: string
}

export type PayrollInput = {
  baseSalary: Prisma.Decimal
  allowances: PayComponent[]
  deductions: PayComponent[]
  /**
   * Set together to prorate. `daysWorked` of `daysInMonth` — omit both for a full month.
   */
  daysWorked?: number
  daysInMonth?: number
}

export type PayrollComputation = {
  /** Base after proration. Equal to the input when the whole month was worked. */
  baseSalary: Prisma.Decimal
  allowanceLines: ComputedLine[]
  deductionLines: ComputedLine[]
  totalAllowances: Prisma.Decimal
  totalDeductions: Prisma.Decimal
  grossPay: Prisma.Decimal
  /** Gross less PRE_TAX deductions: the figure a percentage POST_TAX deduction is taken on. */
  taxableBase: Prisma.Decimal
  netPay: Prisma.Decimal
  /** True when deductions exceed gross. The caller decides whether to allow it. */
  isNegative: boolean
  proratedDays: number | null
  daysInMonth: number | null
}

const ZERO = new Prisma.Decimal(0)

/** Rounds to kobo. Money columns are Decimal(x,2), so every figure has to land there. */
function toKobo(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

/** A percentage of a base, or a flat amount. */
function amountOf(component: PayComponent, base: Prisma.Decimal): Prisma.Decimal {
  if (component.kind === "PERCENTAGE") {
    return toKobo(base.times(component.value).dividedBy(100))
  }
  return toKobo(component.value)
}

function sum(lines: ComputedLine[]): Prisma.Decimal {
  return lines.reduce((total, line) => total.plus(line.amount), ZERO)
}

export function computePay(input: PayrollInput): PayrollComputation {
  const { daysWorked, daysInMonth } = input

  // Prorate only when both figures are present and describe a partial month. A daysWorked
  // greater than daysInMonth would inflate pay, so it is clamped rather than trusted.
  const prorates =
    typeof daysWorked === "number" &&
    typeof daysInMonth === "number" &&
    daysInMonth > 0 &&
    daysWorked < daysInMonth
  const workedDays = prorates ? Math.max(0, daysWorked) : null

  const baseSalary = prorates
    ? toKobo(input.baseSalary.times(workedDays as number).dividedBy(daysInMonth as number))
    : toKobo(input.baseSalary)

  // Allowances come off the prorated base, so a part month scales the whole package.
  const allowanceLines: ComputedLine[] = input.allowances.map((allowance) => ({
    label: allowance.label,
    amount: amountOf(allowance, baseSalary),
    isTaxable: allowance.isTaxable,
    sourceType: allowance.sourceType,
    sourceId: allowance.sourceId,
  }))

  const totalAllowances = sum(allowanceLines)
  const grossPay = toKobo(baseSalary.plus(totalAllowances))

  // Two passes, because a POST_TAX percentage has to see the gross already reduced by the
  // PRE_TAX ones. Doing it in a single pass is the classic payroll bug.
  const preTax = input.deductions.filter((deduction) => deduction.timing === "PRE_TAX")
  const postTax = input.deductions.filter((deduction) => deduction.timing !== "PRE_TAX")

  const preTaxLines: ComputedLine[] = preTax.map((deduction) => ({
    label: deduction.label,
    amount: amountOf(deduction, grossPay),
    timing: "PRE_TAX" as const,
    sourceType: deduction.sourceType,
    sourceId: deduction.sourceId,
  }))

  const taxableBase = toKobo(grossPay.minus(sum(preTaxLines)))

  const postTaxLines: ComputedLine[] = postTax.map((deduction) => ({
    label: deduction.label,
    amount: amountOf(deduction, taxableBase),
    timing: "POST_TAX" as const,
    sourceType: deduction.sourceType,
    sourceId: deduction.sourceId,
  }))

  // Kept in configured order within each timing, PRE_TAX first, so a payslip reads the way
  // the money was actually worked out.
  const deductionLines = [...preTaxLines, ...postTaxLines]
  const totalDeductions = sum(deductionLines)
  const netPay = toKobo(grossPay.minus(totalDeductions))

  return {
    baseSalary,
    allowanceLines,
    deductionLines,
    totalAllowances,
    totalDeductions,
    grossPay,
    taxableBase,
    netPay,
    isNegative: netPay.isNegative(),
    proratedDays: workedDays,
    daysInMonth: prorates ? (daysInMonth as number) : null,
  }
}

/**
 * How many days of a month a staff member was employed for.
 *
 * Both ends are inclusive: somebody who starts on the 1st and leaves on the 30th of a
 * 30-day month worked all 30 days, not 29.
 */
export function daysEmployedInMonth(args: {
  monthStart: Date
  monthEnd: Date
  daysInMonth: number
  dateEmployed: Date
  dateExited?: Date | null
}): number {
  const start = args.dateEmployed > args.monthStart ? args.dateEmployed : args.monthStart
  const end = args.dateExited && args.dateExited < args.monthEnd ? args.dateExited : args.monthEnd

  if (end < start) return 0

  const startDay = start.getTime() > args.monthStart.getTime() ? start.getUTCDate() : 1
  const endDay = end.getTime() < args.monthEnd.getTime() ? end.getUTCDate() : args.daysInMonth

  return Math.max(0, Math.min(args.daysInMonth, endDay - startDay + 1))
}
