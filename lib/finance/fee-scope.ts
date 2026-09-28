/**
 * Who a fee schedule bills, and who it has actually billed.
 *
 * A schedule raises its charges once, when it is created. Everyone admitted afterwards is
 * billed as they enrol — but only from the release that made enrolment do it, and only while
 * the schedule is active. So "60 students billed" on its own says nothing: the question is
 * 60 out of how many, and which of them is missing.
 *
 * The scope rule lives here because three places have to agree on it exactly — the run that
 * creates a schedule, the catch-up that bills whoever it missed, and the coverage figures
 * that say whether anyone is missed at all. A coverage screen computed a different way from
 * the billing it describes is worse than no coverage screen.
 */

export type FeeScheduleScope = {
  sessionId: string
  termId: string | null
  classTermId: string | null
}

/**
 * The enrolments a schedule covers: one class, every class in a term, or the whole session.
 *
 * `status: "ACTIVE"` is the enrolment; `user.isActive` is the person. An enrolment row stays
 * ACTIVE when a student is deactivated or archived — that is recorded on the user — so both
 * are needed or charges keep being raised for people who have left.
 */
export function feeScheduleScopeWhere(schedule: FeeScheduleScope, schoolId: string) {
  const student = { schoolId, user: { isActive: true } }

  if (schedule.classTermId) {
    return { classTermId: schedule.classTermId, status: "ACTIVE" as const, student }
  }

  if (schedule.termId) {
    return { termId: schedule.termId, status: "ACTIVE" as const, student }
  }

  // A session-wide schedule is every enrolment in a term of that session — not every
  // enrolment in the school, which would reach into other school years.
  return { status: "ACTIVE" as const, student, term: { sessionId: schedule.sessionId } }
}

/** Whether an enrolment falls inside a schedule's scope, for filtering a list already loaded. */
export function isInFeeScheduleScope(
  enrolment: { classTermId: string; termId: string; sessionId: string },
  schedule: FeeScheduleScope,
): boolean {
  if (schedule.classTermId) return enrolment.classTermId === schedule.classTermId
  if (schedule.termId) return enrolment.termId === schedule.termId
  return enrolment.sessionId === schedule.sessionId
}

export type CoverageRow = { studentId: string; className: string }

export type ClassCoverage = {
  className: string
  inScope: number
  billed: number
  unbilled: number
}

export type Coverage = {
  inScope: number
  billed: number
  unbilled: number
  byClass: ClassCoverage[]
}

/**
 * How far a schedule's billing reaches, in total and class by class.
 *
 * One student can hold more than one enrolment row inside a scope — a whole-session schedule
 * sees them once per term — so the totals count students, not rows, while the class figures
 * count each class's own roll. That is why a session-wide schedule's class rows can add up
 * to more than its total.
 */
export function summariseCoverage(rows: CoverageRow[], billedStudentIds: Set<string>): Coverage {
  const byClass = new Map<string, { inScope: Set<string>; billed: Set<string> }>()
  const inScope = new Set<string>()
  const billed = new Set<string>()

  for (const row of rows) {
    inScope.add(row.studentId)
    if (billedStudentIds.has(row.studentId)) billed.add(row.studentId)

    const entry = byClass.get(row.className) ?? { inScope: new Set<string>(), billed: new Set<string>() }
    entry.inScope.add(row.studentId)
    if (billedStudentIds.has(row.studentId)) entry.billed.add(row.studentId)
    byClass.set(row.className, entry)
  }

  return {
    inScope: inScope.size,
    billed: billed.size,
    unbilled: inScope.size - billed.size,
    byClass: [...byClass.entries()]
      .map(([className, entry]) => ({
        className,
        inScope: entry.inScope.size,
        billed: entry.billed.size,
        unbilled: entry.inScope.size - entry.billed.size,
      }))
      // Classes with somebody missing first: that is the reason to open this screen.
      .sort((a, b) => b.unbilled - a.unbilled || a.className.localeCompare(b.className)),
  }
}
