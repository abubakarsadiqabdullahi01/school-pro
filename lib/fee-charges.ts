/**
 * Which fee schedules a single enrolment attracts.
 *
 * Fees used to be raised in one direction only: `createFeeSchedule` looked up
 * everyone enrolled at that moment and billed them. A student admitted the next
 * day was never billed — no charge, no balance, and absent from the debtors
 * report, which reads as "nothing owing" rather than as an error. The fix is to
 * bill on enrolment as well, and that needs the matching rule in one place both
 * directions can share.
 *
 * Kept pure, like `lib/payroll.ts`, because it decides what a family is asked to
 * pay: no database, no session, just schedules in and schedules out.
 *
 * Scope is read from how much of the hierarchy a schedule pins down:
 *
 *   classTermId set          → that one class, that one term
 *   termId set, no classTerm → every class in the term
 *   neither set              → every enrolment in the session
 */

export type AppliesTo = "NEW_STUDENTS" | "RETURNING_STUDENTS" | "ALL_STUDENTS"

/** The fields of a FeeSchedule this decision needs. */
export type SchedulableFee = {
  id: string
  classTermId: string | null
  termId: string | null
  appliesTo: AppliesTo
}

/** Where a student has just been enrolled. */
export type Enrolment = {
  classTermId: string
  termId: string
}

/** True when the schedule's scope covers this enrolment. */
export function coversEnrolment(schedule: SchedulableFee, enrolment: Enrolment): boolean {
  if (schedule.classTermId) return schedule.classTermId === enrolment.classTermId
  if (schedule.termId) return schedule.termId === enrolment.termId
  return true
}

/**
 * The schedules to charge for this enrolment.
 *
 * `isReturningStudent` is the same question `createFeeSchedule` asks — has this
 * student been enrolled in an earlier session — so a student billed through
 * either path is billed the same way. A schedule for new students must never
 * reach a returning one just because the enrolment happened to arrive late.
 */
export function schedulesForEnrolment(
  schedules: SchedulableFee[],
  enrolment: Enrolment,
  options: { isReturningStudent: boolean },
): SchedulableFee[] {
  return schedules.filter((schedule) => {
    if (!coversEnrolment(schedule, enrolment)) return false
    if (schedule.appliesTo === "ALL_STUDENTS") return true
    return schedule.appliesTo === "RETURNING_STUDENTS"
      ? options.isReturningStudent
      : !options.isReturningStudent
  })
}
