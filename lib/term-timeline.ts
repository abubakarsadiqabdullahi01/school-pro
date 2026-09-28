import { differenceInCalendarDays, formatDistanceStrict } from "date-fns"

/**
 * Where a term sits in time, in the words a school would use.
 *
 * "Apr 15 2026 – Jul 19 2026" tells you the dates but not the thing you actually want to
 * know when you open the page: is this term running, and how much of it is left. The date
 * arithmetic is small but easy to get wrong at the edges — the day a term starts, the day
 * it ends, a one-day term — so it lives here with tests rather than inline in the page.
 */

export type TermPhase = "upcoming" | "running" | "ended"

export type TermTimeline = {
  phase: TermPhase
  /** How much of the term has elapsed, 0–100, for the progress bar. */
  percent: number
  /** Plain-language line: "Ends in 2 months", "Day 26 of 96", "Ended 2 months ago". */
  summary: string
  /** Whole days from the first to the last, both counted. */
  days: number
  /** Rounded weeks, which is how term length is usually quoted. */
  weeks: number
  /** Which day of the term today is — null unless the term is running. */
  dayOfTerm: number | null
}

export type TermDates = {
  startDate: Date | string
  endDate: Date | string
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

export function termTimeline(term: TermDates, now: Date = new Date()): TermTimeline {
  const start = asDate(term.startDate)
  const end = asDate(term.endDate)

  // Both ends counted: a term that starts and ends on the same day lasts one day, not none.
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1)
  const weeks = Math.max(1, Math.round(days / 7))

  if (now < start) {
    return {
      phase: "upcoming",
      percent: 0,
      summary: `Starts ${formatDistanceStrict(start, now, { addSuffix: true })}`,
      days,
      weeks,
      dayOfTerm: null,
    }
  }

  if (now > end) {
    return {
      phase: "ended",
      percent: 100,
      summary: `Ended ${formatDistanceStrict(end, now, { addSuffix: true })}`,
      days,
      weeks,
      dayOfTerm: null,
    }
  }

  const dayOfTerm = Math.min(days, differenceInCalendarDays(now, start) + 1)
  // Clamped away from 0 and 100 so a running term never looks finished or unstarted.
  const percent = Math.min(99, Math.max(1, Math.round((dayOfTerm / days) * 100)))

  return {
    phase: "running",
    percent,
    summary: `Day ${dayOfTerm} of ${days} — ends ${formatDistanceStrict(end, now, { addSuffix: true })}`,
    days,
    weeks,
    dayOfTerm,
  }
}
