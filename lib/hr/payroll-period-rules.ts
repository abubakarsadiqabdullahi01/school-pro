/**
 * Which month a payroll run may be generated for.
 *
 * A payroll month is generated once and once only. `PayrollRun` is unique on
 * (school, year, month) at the database, which is the last line of defence; these are the
 * rules the screen greys the button out with and the server refuses on, so the two cannot
 * drift and neither has to phrase the refusal twice.
 *
 * Three things are being prevented, in the order a person meets them:
 *
 *  - **A month that has not arrived.** A run for next March would pay people for work
 *    nobody has done, and the year select happily offers three years ahead.
 *  - **A month that already has a run.** Whatever became of that run — draft, awaiting
 *    approval, approved, paid, even cancelled — the month is spoken for. A cancelled run is
 *    the record of a mistake, and generating over it would erase the evidence.
 *  - **Nothing else.** An earlier month with no run at all is a gap, and filling a gap is
 *    legitimate: a school that started using the system in March still has to pay January.
 *    That case is allowed, with a note, because doing it by accident is easy.
 */

export type PayrollPeriod = { year: number; month: number }

export type PayrollRunSummary = PayrollPeriod & { status: string }

export type PayrollPeriodVerdict =
  | { allowed: true; note?: string }
  | { allowed: false; reason: string }

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** "September 2026" — for a sentence a person reads, not the `2026-09` a machine sorts on. */
export function payrollPeriodLabel({ year, month }: PayrollPeriod): string {
  return `${MONTHS[month - 1] ?? `Month ${month}`} ${year}`
}

/** Months since year zero, so two periods can be compared and ordered as one number. */
export function periodIndex({ year, month }: PayrollPeriod): number {
  return year * 12 + (month - 1)
}

const STATUS_WORDS: Record<string, string> = {
  DRAFT: "still a draft",
  PENDING_APPROVAL: "awaiting approval",
  APPROVED: "approved",
  PAID: "paid",
  CANCELLED: "cancelled",
}

function statusPhrase(status: string): string {
  return STATUS_WORDS[status] ?? status.toLowerCase().replace(/_/g, " ")
}

/**
 * Whether payroll may be generated for `target`.
 *
 * `today` is passed in rather than read from the clock so the rule is testable and so the
 * server and the screen can agree on which month it is.
 */
export function canGeneratePayroll(
  target: PayrollPeriod,
  facts: { existing: readonly PayrollRunSummary[]; today: PayrollPeriod },
): PayrollPeriodVerdict {
  const wanted = periodIndex(target)

  if (wanted > periodIndex(facts.today)) {
    return {
      allowed: false,
      reason: `${payrollPeriodLabel(target)} has not started yet. Payroll is generated for a month that is under way, not one still to come.`,
    }
  }

  const clash = facts.existing.find((run) => run.year === target.year && run.month === target.month)
  if (clash) {
    return {
      allowed: false,
      reason:
        clash.status === "CANCELLED"
          ? `${payrollPeriodLabel(target)} was already generated and then cancelled. A month is generated once — the cancelled run stays as the record of what happened.`
          : `${payrollPeriodLabel(target)} has already been generated and is ${statusPhrase(
              clash.status,
            )}. A month is generated once; open that run to change it.`,
    }
  }

  // A back-fill is allowed but worth saying out loud, because picking last year's month by
  // accident and getting a silent success is how a school ends up paying twice.
  const latest = facts.existing.reduce<number | null>(
    (highest, run) => Math.max(highest ?? Number.NEGATIVE_INFINITY, periodIndex(run)),
    null,
  )

  if (latest !== null && wanted < latest) {
    const newest = facts.existing.reduce((best, run) =>
      periodIndex(run) > periodIndex(best) ? run : best,
    )
    return {
      allowed: true,
      note: `This is earlier than ${payrollPeriodLabel(
        newest,
      )}, which has already been run. That is allowed — the month has no run of its own — but check it is the month you meant.`,
    }
  }

  return { allowed: true }
}

/**
 * The months that can still be generated, newest first.
 *
 * For a screen that would rather offer the valid choices than explain a refusal. `horizon`
 * is how far back to look; a school does not need to be offered 2019.
 */
export function generatablePeriods(
  facts: { existing: readonly PayrollRunSummary[]; today: PayrollPeriod },
  horizon = 24,
): PayrollPeriod[] {
  const periods: PayrollPeriod[] = []
  const end = periodIndex(facts.today)

  for (let index = end; index > end - horizon; index -= 1) {
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    if (canGeneratePayroll({ year, month }, facts).allowed) periods.push({ year, month })
  }

  return periods
}
