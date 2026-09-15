import { Prisma } from "@prisma/client"

import { schedulesForEnrolment, type SchedulableFee } from "@/lib/fee-charges"

/**
 * Raising the charges a new enrolment attracts.
 *
 * Deliberately not in `app/actions/finance.ts`: that file is `"use server"`, so
 * everything it exports becomes a callable endpoint, and nothing outside the
 * enrolment paths should be able to ask the server to bill a student.
 *
 * Takes the transaction client rather than importing `prisma`, so the charges
 * and the enrolment that caused them commit or roll back together. A student
 * enrolled without their fees is the bug this exists to prevent; enrolling them
 * and then failing to bill them in a separate transaction would recreate it.
 */

type Tx = Prisma.TransactionClient

type BillableSchedule = SchedulableFee & {
  amount: Prisma.Decimal
  dueDate: Date | null
}

/**
 * Charges `studentId` for every active fee schedule covering the class term
 * they have just joined, and returns how many charges that created.
 *
 * Safe to call more than once: `StudentCharge` is unique on
 * (studentId, feeScheduleId) and the insert skips duplicates, so a re-enrolment
 * or a repeated transition tops up what is missing instead of double-billing.
 */
export async function raiseEnrolmentCharges(
  tx: Tx,
  args: { schoolId: string; studentId: string; classTermId: string; termId: string },
): Promise<number> {
  const term = await tx.term.findUnique({
    where: { id: args.termId },
    select: { sessionId: true, session: { select: { startDate: true } } },
  })
  if (!term) return 0

  const schedules: BillableSchedule[] = await tx.feeSchedule.findMany({
    where: { schoolId: args.schoolId, sessionId: term.sessionId, isActive: true },
    select: { id: true, classTermId: true, termId: true, appliesTo: true, amount: true, dueDate: true },
  })
  if (schedules.length === 0) return 0

  // "Returning" is the same question createFeeSchedule asks: enrolled in any
  // session that began before this one.
  const earlier = await tx.studentClassTerm.findFirst({
    where: {
      studentId: args.studentId,
      term: { session: { schoolId: args.schoolId, startDate: { lt: term.session.startDate } } },
    },
    select: { id: true },
  })

  const due = schedulesForEnrolment(
    schedules,
    { classTermId: args.classTermId, termId: args.termId },
    { isReturningStudent: Boolean(earlier) },
  ) as BillableSchedule[]
  if (due.length === 0) return 0

  const created = await tx.studentCharge.createMany({
    data: due.map((schedule) => ({
      schoolId: args.schoolId,
      studentId: args.studentId,
      sessionId: term.sessionId,
      termId: args.termId,
      classTermId: args.classTermId,
      feeScheduleId: schedule.id,
      originalAmount: schedule.amount,
      finalAmountDue: schedule.amount,
      balance: schedule.amount,
      dueDate: schedule.dueDate,
    })),
    skipDuplicates: true,
  })

  return created.count
}
