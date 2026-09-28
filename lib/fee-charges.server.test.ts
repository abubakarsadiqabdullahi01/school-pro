import { Prisma } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

import { raiseEnrolmentCharges } from "./fee-charges.server"

/**
 * What a student admitted after the fees were set up is charged.
 *
 * This is the path a "late" admission actually takes: the admission, the class change and
 * the promotion each create the enrolment and then call this, inside the same transaction.
 * The pure matching rule is covered in `fee-charges.test.ts`; what is checked here is the
 * query it runs and the charge rows it writes — an active schedule missed here is a student
 * carrying a zero balance for a term.
 */

const term = { sessionId: "session-2025", session: { startDate: new Date("2025-09-01") } }

const schedules = [
  {
    id: "tuition-third",
    classTermId: null,
    termId: "term-third",
    appliesTo: "ALL_STUDENTS" as const,
    amount: new Prisma.Decimal(45000),
    dueDate: new Date("2026-08-24"),
  },
  {
    id: "levy-third",
    classTermId: null,
    termId: "term-third",
    appliesTo: "RETURNING_STUDENTS" as const,
    amount: new Prisma.Decimal(7500),
    dueDate: null,
  },
  {
    id: "admission",
    classTermId: null,
    termId: null,
    appliesTo: "NEW_STUDENTS" as const,
    amount: new Prisma.Decimal(25000),
    dueDate: null,
  },
  {
    id: "waec-sss3a",
    classTermId: "classterm-sss3a",
    termId: "term-third",
    appliesTo: "ALL_STUDENTS" as const,
    amount: new Prisma.Decimal(38000),
    dueDate: null,
  },
]

type ChargeRow = {
  feeScheduleId: string
  studentId: string
  sessionId: string
  termId: string
  classTermId: string
  originalAmount: Prisma.Decimal
  finalAmountDue: Prisma.Decimal
  balance: Prisma.Decimal
  dueDate: Date | null
}

type CreateManyArgs = { data: ChargeRow[]; skipDuplicates?: boolean }

function fakeTx({ hasEarlierEnrolment = false }: { hasEarlierEnrolment?: boolean } = {}) {
  const createMany = vi.fn(async ({ data }: CreateManyArgs) => ({ count: data.length }))
  const scheduleQuery = vi.fn(async (_args: { where: unknown }) => schedules)

  return {
    tx: {
      term: { findUnique: vi.fn(async () => term) },
      feeSchedule: { findMany: scheduleQuery },
      studentClassTerm: {
        findFirst: vi.fn(async () => (hasEarlierEnrolment ? { id: "earlier" } : null)),
      },
      studentCharge: { createMany },
    },
    createMany,
    scheduleQuery,
  }
}

/** The charge rows a run wrote, and the schedules they were written for. */
const charges = (createMany: ReturnType<typeof fakeTx>["createMany"]): ChargeRow[] =>
  createMany.mock.calls[0]?.[0].data ?? []

const chargedSchedules = (createMany: ReturnType<typeof fakeTx>["createMany"]) =>
  charges(createMany).map((row) => row.feeScheduleId)

const enrolment = {
  schoolId: "school-1",
  studentId: "student-late",
  classTermId: "classterm-jss1a",
  termId: "term-third",
}

describe("raiseEnrolmentCharges — a student admitted mid-term", () => {
  it("bills the fees that cover the class they joined, and nothing else", async () => {
    const { tx, createMany } = fakeTx()

    const created = await raiseEnrolmentCharges(tx as never, enrolment)

    expect(created).toBe(2)
    // Tuition covers every class in the term; Admission covers the session and this student
    // is new. The levy is for returning students and WAEC is another class's fee.
    expect(chargedSchedules(createMany)).toEqual(["tuition-third", "admission"])
  })

  it("charges a returning student the levy and not the admission fee", async () => {
    const { tx, createMany } = fakeTx({ hasEarlierEnrolment: true })

    await raiseEnrolmentCharges(tx as never, enrolment)

    expect(chargedSchedules(createMany)).toEqual(["tuition-third", "levy-third"])
  })

  it("asks only for active schedules in the term's own session", async () => {
    // An inactive schedule is one somebody switched off on purpose; a schedule from another
    // school year is not this student's business.
    const { tx, scheduleQuery } = fakeTx()

    await raiseEnrolmentCharges(tx as never, enrolment)

    expect(scheduleQuery.mock.calls[0]?.[0].where).toEqual({
      schoolId: "school-1",
      sessionId: "session-2025",
      isActive: true,
    })
  })

  it("writes the schedule's amount as the charge, owing in full", async () => {
    const { tx, createMany } = fakeTx()

    await raiseEnrolmentCharges(tx as never, enrolment)

    const tuition = charges(createMany)[0]

    expect(tuition.originalAmount.toString()).toBe("45000")
    expect(tuition.finalAmountDue.toString()).toBe("45000")
    expect(tuition.balance.toString()).toBe("45000")
    expect(tuition.dueDate).toEqual(new Date("2026-08-24"))
    expect(tuition).toMatchObject({
      studentId: "student-late",
      classTermId: "classterm-jss1a",
      termId: "term-third",
      sessionId: "session-2025",
    })
  })

  it("skips duplicates, so re-enrolling cannot bill the same fee twice", async () => {
    const { tx, createMany } = fakeTx()

    await raiseEnrolmentCharges(tx as never, enrolment)

    expect(createMany.mock.calls[0]?.[0].skipDuplicates).toBe(true)
  })

  it("still bills the session-wide fee for a term that has no schedules of its own", async () => {
    const { tx, createMany } = fakeTx()

    const created = await raiseEnrolmentCharges(tx as never, {
      ...enrolment,
      // Nothing is pinned to First Term, so only the fee that covers the whole session
      // reaches this enrolment.
      termId: "term-first",
    })

    expect(created).toBe(1)
    expect(chargedSchedules(createMany)).toEqual(["admission"])
  })
})
