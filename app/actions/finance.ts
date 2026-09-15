"use server"

import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { AuthorizationError, requirePermission, type Actor } from "@/lib/authz"
import { getActiveSchool } from "@/lib/school-context.server"

const moneySchema = z.coerce.number().positive().max(9999999999)

const feeCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().nullable(),
  type: z.enum(["MANDATORY", "OPTIONAL", "REGISTRATION", "SERVICE"]).default("MANDATORY"),
})

const feeScheduleSchema = z.object({
  sessionId: z.string().min(1),
  termId: z.string().min(1).optional().nullable(),
  classTermId: z.string().min(1).optional().nullable(),
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  amount: moneySchema,
  appliesTo: z.enum(["NEW_STUDENTS", "RETURNING_STUDENTS", "ALL_STUDENTS"]).default("ALL_STUDENTS"),
  isMandatory: z.coerce.boolean().default(true),
  dueDate: z.coerce.date().optional().nullable(),
})

const paymentAllocationSchema = z.object({
  chargeId: z.string().min(1),
  amount: moneySchema,
})

const paymentSchema = z.object({
  studentId: z.string().min(1),
  termId: z.string().min(1),
  paymentDate: z.coerce.date().default(() => new Date()),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "POS", "ONLINE", "CHEQUE"]),
  referenceNo: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  allocations: z.array(paymentAllocationSchema).min(1),
})

const financeOfficerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().optional(),
})

const adjustmentSchema = z.object({
  studentId: z.string().min(1),
  chargeId: z.string().min(1),
  type: z.enum(["FIXED", "PERCENTAGE"]),
  value: moneySchema,
  reason: z.string().trim().min(3).max(300),
})

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function moneyString(value: Prisma.Decimal.Value | null | undefined): string {
  return money(value ?? 0).toFixed(2)
}

/**
 * Finance is per-school: fee schedules, charges and receipt numbering all hang off a
 * single school, so there is no meaningful "all schools" view of it.
 *
 * Admins and accountants carry their school on their own record. A super admin does not —
 * they browse the whole platform and choose a school with the switcher — so fall back to
 * that. On "All schools" there is nothing to bill against, which is what the error says.
 */
async function actorSchool(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId

  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }

  throw new AuthorizationError("Select a school before using finance")
}

async function requireFinanceViewer(): Promise<Actor> {
  return requirePermission("finance.view_reports")
}

async function requireFinanceManager(): Promise<Actor> {
  return requirePermission("finance.setup")
}

async function requirePaymentRecorder(): Promise<Actor> {
  return requirePermission("finance.collect_payments")
}

/**
 * Finance is rendered under two URL trees — /dashboard/admin/finance for admins and
 * /dashboard/accountant for the assigned officer — so every write has to clear both.
 * Revalidating only the admin tree leaves an accountant looking at the balances they
 * just changed. Paths that exist in one tree and not the other are a harmless no-op.
 */
function revalidateFinance(...suffixes: string[]) {
  for (const base of ["/dashboard/admin/finance", "/dashboard/accountant"]) {
    revalidatePath(base)
    for (const suffix of suffixes) {
      revalidatePath(`${base}${suffix}`)
    }
  }
}

function toError(error: unknown, fallback: string): { success: false; error: string } {
  // A ZodError must not be handed to console.error: Node's inspect walks it and throws
  // TypeError: Cannot read properties of undefined (reading 'value'). That throw escapes
  // this catch block, so every rejected form field became an unhandled server error
  // instead of a message. Log the issues as plain data, and return the first one — the
  // ZodError's own `message` is a JSON dump of the whole issue array.
  if (error instanceof z.ZodError) {
    console.error(fallback, error.issues)
    const [issue] = error.issues
    if (!issue) return { success: false, error: fallback }
    const field = issue.path.join(".")
    return { success: false, error: field ? `${field}: ${issue.message}` : issue.message }
  }

  console.error(fallback, error)
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

function statusFor(finalAmountDue: Prisma.Decimal, amountPaid: Prisma.Decimal): "UNPAID" | "PARTIAL" | "PAID" | "WAIVED" {
  if (finalAmountDue.lte(0)) return "WAIVED"
  if (amountPaid.gte(finalAmountDue)) return "PAID"
  if (amountPaid.gt(0)) return "PARTIAL"
  return "UNPAID"
}

/**
 * Of the given students, which were already enrolled before this session started.
 *
 * "New" and "returning" are not properties of a student — they are relative to the session
 * in question. A student is returning if they were enrolled in any session that started
 * earlier, and new if this is their first. Reading it from enrolment history rather than a
 * flag someone has to remember to set is what keeps a registration fee from following a
 * student into their second year.
 *
 * Both the billing path and the debtor filter go through here, so the two cannot drift.
 */
async function returningStudentIds(
  studentIds: string[],
  schoolId: string,
  sessionStartDate: Date,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set()

  const earlier = await prisma.studentClassTerm.findMany({
    where: {
      studentId: { in: [...new Set(studentIds)] },
      term: { session: { schoolId, startDate: { lt: sessionStartDate } } },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  })

  return new Set(earlier.map((row) => row.studentId))
}

/** Narrows a fee schedule's enrolment list to the students the schedule applies to. */
async function studentsForAppliesTo<T extends { studentId: string }>(
  enrolments: T[],
  appliesTo: "NEW_STUDENTS" | "RETURNING_STUDENTS" | "ALL_STUDENTS",
  schoolId: string,
  sessionStartDate: Date,
): Promise<T[]> {
  if (appliesTo === "ALL_STUDENTS" || enrolments.length === 0) return enrolments

  const returning = await returningStudentIds(
    enrolments.map((enrolment) => enrolment.studentId),
    schoolId,
    sessionStartDate,
  )

  return appliesTo === "RETURNING_STUDENTS"
    ? enrolments.filter((enrolment) => returning.has(enrolment.studentId))
    : enrolments.filter((enrolment) => !returning.has(enrolment.studentId))
}

async function recalculateCharge(tx: Prisma.TransactionClient, chargeId: string) {
  const charge = await tx.studentCharge.findUniqueOrThrow({
    where: { id: chargeId },
    select: {
      originalAmount: true,
      amountPaid: true,
      discounts: { where: { isActive: true }, select: { amountApplied: true } },
      exemptions: { where: { isActive: true }, select: { amountApplied: true } },
    },
  })

  const discountAmount = charge.discounts.reduce((total, discount) => total.plus(discount.amountApplied), money(0))
  const exemptedAmount = charge.exemptions.reduce((total, exemption) => total.plus(exemption.amountApplied), money(0))
  const finalAmountDue = Prisma.Decimal.max(charge.originalAmount.minus(discountAmount).minus(exemptedAmount), money(0))

  if (charge.amountPaid.gt(finalAmountDue)) {
    throw new Error("Adjustment would make paid amount greater than the final amount due")
  }

  const balance = finalAmountDue.minus(charge.amountPaid)

  await tx.studentCharge.update({
    where: { id: chargeId },
    data: {
      discountAmount,
      exemptedAmount,
      finalAmountDue,
      balance,
      status: statusFor(finalAmountDue, charge.amountPaid),
    },
  })
}

function calculateAdjustmentAmount(input: {
  type: "FIXED" | "PERCENTAGE"
  value: number
  base: Prisma.Decimal
  remaining: Prisma.Decimal
}) {
  const requested =
    input.type === "PERCENTAGE"
      ? input.base.mul(input.value).div(100).toDecimalPlaces(2)
      : money(input.value).toDecimalPlaces(2)

  if (requested.lte(0)) throw new Error("Adjustment amount must be greater than zero")
  if (requested.gt(input.remaining)) throw new Error("Adjustment cannot exceed the remaining charge amount")
  return requested
}

export async function getFinanceOverview(): Promise<ActionResult<{
  school: { name: string; code: string }
  currentSession: { id: string; name: string } | null
  currentTerm: { id: string; name: string } | null
  totals: {
    expected: string
    paid: string
    outstanding: string
    discounts: string
    exemptions: string
    completedPayments: string
  }
  counts: { paid: number; partial: number; unpaid: number; waived: number }
  recentPayments: Array<{
    id: string
    receiptNo: string
    studentName: string
    admissionNo: string
    amount: string
    status: string
    paymentDate: string
  }>
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const currentSession = await prisma.session.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true },
    })
    const currentTerm = currentSession
      ? await prisma.term.findFirst({
          where: { sessionId: currentSession.id, isCurrent: true },
          select: { id: true, name: true },
        })
      : null

    const chargeWhere = {
      schoolId,
      ...(currentTerm ? { termId: currentTerm.id } : currentSession ? { sessionId: currentSession.id } : {}),
    }
    const paymentWhere = {
      schoolId,
      status: "COMPLETED" as const,
      ...(currentTerm ? { termId: currentTerm.id } : currentSession ? { sessionId: currentSession.id } : {}),
    }

    const [school, chargeTotals, paymentTotals, statusCounts, recentPayments] = await Promise.all([
      prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { name: true, code: true },
      }),
      prisma.studentCharge.aggregate({
        where: chargeWhere,
        _sum: {
          finalAmountDue: true,
          amountPaid: true,
          balance: true,
          discountAmount: true,
          exemptedAmount: true,
        },
      }),
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      prisma.studentCharge.groupBy({
        by: ["status"],
        where: chargeWhere,
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { schoolId, ...(currentTerm ? { termId: currentTerm.id } : {}) },
        orderBy: { paymentDate: "desc" },
        take: 8,
        select: {
          id: true,
          receiptNo: true,
          amount: true,
          status: true,
          paymentDate: true,
          student: {
            select: {
              admissionNo: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ])

    const counts = { paid: 0, partial: 0, unpaid: 0, waived: 0 }
    for (const row of statusCounts) {
      if (row.status === "PAID") counts.paid = row._count._all
      if (row.status === "PARTIAL") counts.partial = row._count._all
      if (row.status === "UNPAID") counts.unpaid = row._count._all
      if (row.status === "WAIVED") counts.waived = row._count._all
    }

    return {
      success: true,
      data: {
        school,
        currentSession,
        currentTerm,
        totals: {
          expected: moneyString(chargeTotals._sum.finalAmountDue),
          paid: moneyString(chargeTotals._sum.amountPaid),
          outstanding: moneyString(chargeTotals._sum.balance),
          discounts: moneyString(chargeTotals._sum.discountAmount),
          exemptions: moneyString(chargeTotals._sum.exemptedAmount),
          completedPayments: moneyString(paymentTotals._sum.amount),
        },
        counts,
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          receiptNo: payment.receiptNo,
          studentName: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
          admissionNo: payment.student.admissionNo,
          amount: moneyString(payment.amount),
          status: payment.status,
          paymentDate: payment.paymentDate.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load finance overview")
  }
}

export async function getFinanceSetupData(): Promise<ActionResult<{
  categories: Array<{ id: string; name: string; type: string; isActive: boolean }>
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string; isCurrent: boolean }>
  classTerms: Array<{ id: string; className: string; termName: string; termId: string }>
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const [categories, sessions, terms, classTerms] = await Promise.all([
      prisma.feeCategory.findMany({
        where: { schoolId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, name: true, type: true, isActive: true },
      }),
      prisma.session.findMany({
        where: { schoolId },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, isCurrent: true },
      }),
      prisma.term.findMany({
        where: { session: { schoolId } },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, sessionId: true, isCurrent: true },
      }),
      prisma.classTerm.findMany({
        where: { class: { schoolId } },
        orderBy: [{ term: { startDate: "desc" } }, { class: { name: "asc" } }],
        select: {
          id: true,
          termId: true,
          class: { select: { name: true } },
          term: { select: { name: true } },
        },
      }),
    ])

    return {
      success: true,
      data: {
        categories,
        sessions,
        terms,
        classTerms: classTerms.map((classTerm) => ({
          id: classTerm.id,
          className: classTerm.class.name,
          termName: classTerm.term.name,
          termId: classTerm.termId,
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load finance setup data")
  }
}

export async function createFeeCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = feeCategorySchema.parse(input)

    const category = await prisma.feeCategory.create({
      data: {
        schoolId,
        name: data.name,
        description: data.description || null,
        type: data.type,
      },
      select: { id: true },
    })

    revalidateFinance("/fees")
    return { success: true, data: category }
  } catch (error) {
    return toError(error, "Failed to create fee category")
  }
}

export async function createFeeSchedule(input: unknown): Promise<ActionResult<{ id: string; chargesCreated: number }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = feeScheduleSchema.parse(input)

    const [session, term, classTerm, category] = await Promise.all([
      prisma.session.findFirst({ where: { id: data.sessionId, schoolId }, select: { id: true, startDate: true } }),
      data.termId
        ? prisma.term.findFirst({ where: { id: data.termId, session: { schoolId } }, select: { id: true } })
        : Promise.resolve(null),
      data.classTermId
        ? prisma.classTerm.findFirst({
            where: { id: data.classTermId, class: { schoolId } },
            select: { id: true, termId: true },
          })
        : Promise.resolve(null),
      prisma.feeCategory.findFirst({ where: { id: data.categoryId, schoolId }, select: { id: true } }),
    ])

    if (!session) throw new Error("Session not found")
    if (data.termId && !term) throw new Error("Term not found")
    if (data.classTermId && !classTerm) throw new Error("Class term not found")
    if (!category) throw new Error("Fee category not found")

    const effectiveTermId = data.termId ?? classTerm?.termId ?? null
    // Only bill students who are still active. An enrolment row stays ACTIVE when a student
    // is deactivated or archived — those are recorded on the user — so filtering on the
    // enrolment alone kept generating charges for people who had left.
    const activeStudent = { student: { user: { isActive: true } } };
    const enrolledStudents = await prisma.studentClassTerm.findMany({
      where: data.classTermId
        ? { classTermId: data.classTermId, status: "ACTIVE", ...activeStudent }
        : effectiveTermId
          ? { termId: effectiveTermId, status: "ACTIVE", student: { schoolId, user: { isActive: true } } }
          : { student: { schoolId, user: { isActive: true } }, status: "ACTIVE" },
      select: {
        studentId: true,
        classTermId: true,
        termId: true,
      },
    })

    const billableStudents = await studentsForAppliesTo(
      enrolledStudents,
      data.appliesTo,
      schoolId,
      session.startDate,
    )

    const amount = money(data.amount)
    const result = await prisma.$transaction(async (tx) => {
      const schedule = await tx.feeSchedule.create({
        data: {
          schoolId,
          sessionId: data.sessionId,
          termId: effectiveTermId,
          classTermId: data.classTermId || null,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description || null,
          amount,
          appliesTo: data.appliesTo,
          isMandatory: data.isMandatory,
          dueDate: data.dueDate || null,
        },
        select: { id: true },
      })

      let chargesCreated = 0
      if (billableStudents.length > 0) {
        // skipDuplicates means the insert count can be lower than the list considered —
        // re-running a schedule must not double-bill, and the caller is told what actually
        // landed rather than what was looked at.
        const created = await tx.studentCharge.createMany({
          data: billableStudents.map((enrollment) => ({
            schoolId,
            studentId: enrollment.studentId,
            sessionId: data.sessionId,
            termId: effectiveTermId ?? enrollment.termId,
            classTermId: data.classTermId ?? enrollment.classTermId,
            feeScheduleId: schedule.id,
            originalAmount: amount,
            finalAmountDue: amount,
            balance: amount,
            dueDate: data.dueDate || null,
          })),
          skipDuplicates: true,
        })
        chargesCreated = created.count
      }

      return { id: schedule.id, chargesCreated }
    })

    revalidateFinance("/fees")
    return { success: true, data: result }
  } catch (error) {
    return toError(error, "Failed to create fee schedule")
  }
}

/**
 * The fee schedules already set up, with how many students each has billed.
 *
 * Fee Setup listed categories only, so a schedule could not be seen after it was
 * created — which is also why nobody noticed that students admitted later were
 * never billed against it. The charge count is the number that makes that
 * visible: compare it with the class roll.
 */
export async function getFeeSchedules(): Promise<ActionResult<Array<{
  id: string
  name: string
  categoryName: string
  sessionName: string
  scope: string
  amount: string
  appliesTo: string
  isActive: boolean
  chargeCount: number
}>>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const schedules = await prisma.feeSchedule.findMany({
      where: { schoolId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        amount: true,
        appliesTo: true,
        isActive: true,
        category: { select: { name: true } },
        session: { select: { name: true } },
        term: { select: { name: true } },
        classTerm: { select: { class: { select: { name: true } }, term: { select: { name: true } } } },
        _count: { select: { charges: true } },
      },
    })

    return {
      success: true,
      data: schedules.map((schedule) => ({
        id: schedule.id,
        name: schedule.name,
        categoryName: schedule.category.name,
        sessionName: schedule.session.name,
        // Scope reads the way it was set: one class, a whole term, or the session.
        scope: schedule.classTerm
          ? `${schedule.classTerm.class.name} · ${schedule.classTerm.term.name}`
          : schedule.term
            ? `All classes · ${schedule.term.name}`
            : "Whole session",
        amount: moneyString(schedule.amount),
        appliesTo: schedule.appliesTo,
        isActive: schedule.isActive,
        chargeCount: schedule._count.charges,
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load fee schedules")
  }
}

/**
 * Bills an existing schedule to anyone its scope now covers but who has no charge.
 *
 * Enrolment raises fees from the moment that behaviour shipped, but students
 * admitted before it — between a schedule being created and this release — have
 * no charge at all, and an unbilled student reads as "nothing owing" rather than
 * as a gap. This is the catch-up, and it is safe to run repeatedly: the unique
 * index on (studentId, feeScheduleId) means only the missing charges land.
 */
export async function applyFeeScheduleToNewStudents(input: unknown): Promise<ActionResult<{
  chargesCreated: number
  studentsConsidered: number
}>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const { scheduleId } = z.object({ scheduleId: z.string().min(1) }).parse(input)

    const schedule = await prisma.feeSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      select: {
        id: true,
        sessionId: true,
        termId: true,
        classTermId: true,
        amount: true,
        appliesTo: true,
        dueDate: true,
        isActive: true,
        session: { select: { startDate: true } },
      },
    })
    if (!schedule) throw new Error("Fee schedule not found")
    if (!schedule.isActive) throw new Error("That fee schedule is inactive. Reactivate it before billing anyone.")

    // Same rule as the original run: an enrolment row stays ACTIVE when the
    // student is deactivated, so the student's own status decides.
    const activeStudent = { user: { isActive: true } }
    const enrolledStudents = await prisma.studentClassTerm.findMany({
      where: schedule.classTermId
        ? { classTermId: schedule.classTermId, status: "ACTIVE", student: activeStudent }
        : schedule.termId
          ? { termId: schedule.termId, status: "ACTIVE", student: { schoolId, ...activeStudent } }
          : {
              status: "ACTIVE",
              student: { schoolId, ...activeStudent },
              term: { sessionId: schedule.sessionId },
            },
      select: { studentId: true, classTermId: true, termId: true },
    })

    const billableStudents = await studentsForAppliesTo(
      enrolledStudents,
      schedule.appliesTo,
      schoolId,
      schedule.session.startDate,
    )

    let chargesCreated = 0
    if (billableStudents.length > 0) {
      const created = await prisma.studentCharge.createMany({
        data: billableStudents.map((enrollment) => ({
          schoolId,
          studentId: enrollment.studentId,
          sessionId: schedule.sessionId,
          termId: schedule.termId ?? enrollment.termId,
          classTermId: schedule.classTermId ?? enrollment.classTermId,
          feeScheduleId: schedule.id,
          originalAmount: schedule.amount,
          finalAmountDue: schedule.amount,
          balance: schedule.amount,
          dueDate: schedule.dueDate,
        })),
        skipDuplicates: true,
      })
      chargesCreated = created.count
    }

    revalidateFinance("/fees")
    return { success: true, data: { chargesCreated, studentsConsidered: billableStudents.length } }
  } catch (error) {
    return toError(error, "Failed to apply the fee schedule")
  }
}

export async function searchFinanceStudents(query: string): Promise<ActionResult<Array<{
  id: string
  admissionNo: string
  name: string
  currentClass: string | null
  outstanding: string
}>>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const text = query.trim()

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        OR: text
          ? [
              { admissionNo: { contains: text } },
              { user: { firstName: { contains: text } } },
              { user: { lastName: { contains: text } } },
            ]
          : undefined,
      },
      take: 60,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        admissionNo: true,
        user: { select: { firstName: true, lastName: true } },
        classTerms: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { classTerm: { select: { class: { select: { name: true } } } } },
        },
        charges: { where: { status: { in: ["UNPAID", "PARTIAL"] } }, select: { balance: true } },
      },
    })

    return {
      success: true,
      data: students.map((student) => ({
        id: student.id,
        admissionNo: student.admissionNo,
        name: `${student.user.firstName} ${student.user.lastName}`,
        currentClass: student.classTerms[0]?.classTerm.class.name ?? null,
        outstanding: moneyString(student.charges.reduce((total, charge) => total.plus(charge.balance), money(0))),
      })),
    }
  } catch (error) {
    return toError(error, "Failed to search students")
  }
}

export async function getStudentStatement(studentId: string): Promise<ActionResult<{
  school: { name: string; code: string }
  student: { id: string; admissionNo: string; name: string; currentClass: string | null; currentTerm: string | null }
  totals: { charged: string; paid: string; discounts: string; exemptions: string; balance: string }
  charges: Array<{ id: string; termId: string | null; description: string; amount: string; paid: string; balance: string; status: string }>
  payments: Array<{ id: string; receiptNo: string; amount: string; paymentDate: string; method: string; status: string }>
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        admissionNo: true,
        // Named on the printed statement, which is handed to a parent.
        school: { select: { name: true, code: true } },
        user: { select: { firstName: true, lastName: true } },
        classTerms: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            classTerm: {
              select: {
                class: { select: { name: true } },
                term: { select: { name: true } },
              },
            },
          },
        },
        charges: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            termId: true,
            finalAmountDue: true,
            amountPaid: true,
            balance: true,
            discountAmount: true,
            exemptedAmount: true,
            status: true,
            feeSchedule: { select: { name: true } },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          select: { id: true, receiptNo: true, amount: true, paymentDate: true, paymentMethod: true, status: true },
        },
      },
    })

    if (!student) throw new Error("Student not found")

    const totals = student.charges.reduce(
      (acc, charge) => ({
        charged: acc.charged.plus(charge.finalAmountDue),
        paid: acc.paid.plus(charge.amountPaid),
        discounts: acc.discounts.plus(charge.discountAmount),
        exemptions: acc.exemptions.plus(charge.exemptedAmount),
        balance: acc.balance.plus(charge.balance),
      }),
      { charged: money(0), paid: money(0), discounts: money(0), exemptions: money(0), balance: money(0) },
    )

    return {
      success: true,
      data: {
        school: { name: student.school.name, code: student.school.code },
        student: {
          id: student.id,
          admissionNo: student.admissionNo,
          name: `${student.user.firstName} ${student.user.lastName}`,
          currentClass: student.classTerms[0]?.classTerm.class.name ?? null,
          currentTerm: student.classTerms[0]?.classTerm.term.name ?? null,
        },
        totals: {
          charged: moneyString(totals.charged),
          paid: moneyString(totals.paid),
          discounts: moneyString(totals.discounts),
          exemptions: moneyString(totals.exemptions),
          balance: moneyString(totals.balance),
        },
        charges: student.charges.map((charge) => ({
          id: charge.id,
          termId: charge.termId,
          description: charge.feeSchedule.name,
          amount: moneyString(charge.finalAmountDue),
          paid: moneyString(charge.amountPaid),
          balance: moneyString(charge.balance),
          status: charge.status,
        })),
        payments: student.payments.map((payment) => ({
          id: payment.id,
          receiptNo: payment.receiptNo,
          amount: moneyString(payment.amount),
          paymentDate: payment.paymentDate.toISOString(),
          method: payment.paymentMethod,
          status: payment.status,
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load student statement")
  }
}

export async function applyChargeDiscount(input: unknown): Promise<ActionResult<{ id: string; amountApplied: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = adjustmentSchema.parse(input)

    const result = await prisma.$transaction(async (tx) => {
      const charge = await tx.studentCharge.findFirst({
        where: { id: data.chargeId, studentId: data.studentId, schoolId },
        select: {
          id: true,
          studentId: true,
          sessionId: true,
          termId: true,
          feeScheduleId: true,
          originalAmount: true,
          finalAmountDue: true,
          amountPaid: true,
          discountAmount: true,
          exemptedAmount: true,
          feeSchedule: { select: { categoryId: true } },
        },
      })
      if (!charge) throw new Error("Charge not found")

      const remainingBeforePayment = charge.finalAmountDue.minus(charge.amountPaid)
      const amountApplied = calculateAdjustmentAmount({
        type: data.type,
        value: data.value,
        base: charge.originalAmount,
        remaining: remainingBeforePayment,
      })

      const discount = await tx.discount.create({
        data: {
          schoolId,
          studentId: charge.studentId,
          sessionId: charge.sessionId,
          termId: charge.termId,
          feeScheduleId: charge.feeScheduleId,
          chargeId: charge.id,
          categoryId: charge.feeSchedule.categoryId,
          type: data.type,
          value: money(data.value),
          amountApplied,
          reason: data.reason,
          approvedBy: actor.userId,
          createdBy: actor.userId,
        },
        select: { id: true, amountApplied: true },
      })

      await recalculateCharge(tx, charge.id)
      return discount
    })

    revalidateFinance("/discounts", `/students/${data.studentId}/statement`)
    return { success: true, data: { id: result.id, amountApplied: moneyString(result.amountApplied) } }
  } catch (error) {
    return toError(error, "Failed to apply discount")
  }
}

export async function applyChargeExemption(input: unknown): Promise<ActionResult<{ id: string; amountApplied: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = adjustmentSchema.parse(input)

    const result = await prisma.$transaction(async (tx) => {
      const charge = await tx.studentCharge.findFirst({
        where: { id: data.chargeId, studentId: data.studentId, schoolId },
        select: {
          id: true,
          studentId: true,
          sessionId: true,
          termId: true,
          feeScheduleId: true,
          originalAmount: true,
          finalAmountDue: true,
          amountPaid: true,
          feeSchedule: { select: { categoryId: true } },
        },
      })
      if (!charge) throw new Error("Charge not found")

      const remainingBeforePayment = charge.finalAmountDue.minus(charge.amountPaid)
      const amountApplied = calculateAdjustmentAmount({
        type: data.type,
        value: data.value,
        base: charge.originalAmount,
        remaining: remainingBeforePayment,
      })

      const exemption = await tx.feeExemption.create({
        data: {
          schoolId,
          studentId: charge.studentId,
          sessionId: charge.sessionId,
          termId: charge.termId,
          feeScheduleId: charge.feeScheduleId,
          chargeId: charge.id,
          categoryId: charge.feeSchedule.categoryId,
          type: amountApplied.equals(remainingBeforePayment) ? "FULL" : "PARTIAL",
          value: money(data.value),
          amountApplied,
          reason: data.reason,
          approvedBy: actor.userId,
          createdBy: actor.userId,
        },
        select: { id: true, amountApplied: true },
      })

      await recalculateCharge(tx, charge.id)
      return exemption
    })

    revalidateFinance("/exemptions", `/students/${data.studentId}/statement`)
    return { success: true, data: { id: result.id, amountApplied: moneyString(result.amountApplied) } }
  } catch (error) {
    return toError(error, "Failed to apply exemption")
  }
}

export async function getFinanceAdjustments(): Promise<ActionResult<{
  discounts: Array<{ id: string; studentName: string; feeName: string; amount: string; reason: string; createdAt: string }>
  exemptions: Array<{ id: string; studentName: string; feeName: string; amount: string; reason: string; createdAt: string }>
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const [discounts, exemptions] = await Promise.all([
      prisma.discount.findMany({
        where: { schoolId, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amountApplied: true,
          reason: true,
          createdAt: true,
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
          feeSchedule: { select: { name: true } },
        },
      }),
      prisma.feeExemption.findMany({
        where: { schoolId, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amountApplied: true,
          reason: true,
          createdAt: true,
          student: { select: { user: { select: { firstName: true, lastName: true } } } },
          feeSchedule: { select: { name: true } },
        },
      }),
    ])

    return {
      success: true,
      data: {
        discounts: discounts.map((discount) => ({
          id: discount.id,
          studentName: `${discount.student.user.firstName} ${discount.student.user.lastName}`,
          feeName: discount.feeSchedule?.name ?? "Fee",
          amount: moneyString(discount.amountApplied),
          reason: discount.reason,
          createdAt: discount.createdAt.toISOString(),
        })),
        exemptions: exemptions.map((exemption) => ({
          id: exemption.id,
          studentName: `${exemption.student.user.firstName} ${exemption.student.user.lastName}`,
          feeName: exemption.feeSchedule?.name ?? "Fee",
          amount: moneyString(exemption.amountApplied),
          reason: exemption.reason,
          createdAt: exemption.createdAt.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load finance adjustments")
  }
}

export async function recordStudentPayment(input: unknown): Promise<ActionResult<{ id: string; receiptNo: string }>> {
  try {
    const actor = await requirePaymentRecorder()
    const schoolId = await actorSchool(actor)
    const data = paymentSchema.parse(input)

    const allocationTotal = data.allocations.reduce((total, allocation) => total.plus(allocation.amount), money(0))
    const student = await prisma.student.findFirst({ where: { id: data.studentId, schoolId }, select: { id: true } })
    if (!student) throw new Error("Student not found")

    const term = await prisma.term.findFirst({
      where: { id: data.termId, session: { schoolId } },
      select: { id: true, sessionId: true },
    })
    if (!term) throw new Error("Term not found")

    const chargeIds = data.allocations.map((allocation) => allocation.chargeId)
    const charges = await prisma.studentCharge.findMany({
      where: { id: { in: chargeIds }, studentId: data.studentId, schoolId },
      select: { id: true, balance: true },
    })
    if (charges.length !== chargeIds.length) throw new Error("One or more selected charges were not found")

    const chargeBalances = new Map(charges.map((charge) => [charge.id, charge.balance]))
    for (const allocation of data.allocations) {
      const balance = chargeBalances.get(allocation.chargeId)
      if (!balance || money(allocation.amount).gt(balance)) {
        throw new Error("Payment allocation cannot exceed the selected charge balance")
      }
    }

    const year = data.paymentDate.getFullYear()
    const payment = await prisma.$transaction(async (tx) => {
      const sequence = await tx.receiptSequence.upsert({
        where: { schoolId_year: { schoolId, year } },
        create: { schoolId, year, lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      })
      const receiptNo = `RCPT-${year}-${String(sequence.lastSequence).padStart(5, "0")}`

      const created = await tx.payment.create({
        data: {
          schoolId,
          studentId: data.studentId,
          termId: data.termId,
          sessionId: term.sessionId,
          amount: allocationTotal,
          paymentDate: data.paymentDate,
          receiptNo,
          paymentMethod: data.paymentMethod,
          referenceNo: data.referenceNo || receiptNo,
          receivedBy: actor.userId,
          notes: data.notes || null,
          status: "COMPLETED",
          allocations: {
            create: data.allocations.map((allocation) => ({
              chargeId: allocation.chargeId,
              amount: money(allocation.amount),
            })),
          },
        },
        select: { id: true, receiptNo: true },
      })

      for (const allocation of data.allocations) {
        const charge = await tx.studentCharge.findUniqueOrThrow({
          where: { id: allocation.chargeId },
          select: { finalAmountDue: true, amountPaid: true },
        })
        const newPaid = charge.amountPaid.plus(allocation.amount)
        const newBalance = charge.finalAmountDue.minus(newPaid)

        await tx.studentCharge.update({
          where: { id: allocation.chargeId },
          data: {
            amountPaid: newPaid,
            balance: newBalance,
            status: newBalance.lte(0) ? "PAID" : "PARTIAL",
          },
        })
      }

      return created
    })

    revalidateFinance("/student-payments", `/students/${data.studentId}/statement`)
    return { success: true, data: payment }
  } catch (error) {
    return toError(error, "Failed to record payment")
  }
}

/** Filters the debtor list accepts. All optional; omitted means "no restriction". */
export type DebtorFilters = {
  sessionId?: string | null
  termId?: string | null
  classTermId?: string | null
  /** Minimum the student owes in total, not per charge — this is a chase-list threshold. */
  minBalance?: number | null
  /** UNPAID means nothing at all has been paid; PARTIAL means something has. */
  paymentStatus?: "UNPAID" | "PARTIAL" | null
  studentType?: "NEW_STUDENTS" | "RETURNING_STUDENTS" | null
}

export async function getDebtorsReport(filters?: DebtorFilters): Promise<ActionResult<Array<{
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  parentContact: string | null
  totalFees: string
  totalPaid: string
  discounts: string
  exemptions: string
  balance: string
  lastPaymentDate: string | null
}>>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    // "New" and "returning" only mean something against a session. Use the one being
    // filtered on, else the school's current session; without either the question has no
    // answer and saying so beats silently returning everyone.
    let typeSession: { id: string; startDate: Date } | null = null
    if (filters?.studentType) {
      typeSession = filters.sessionId
        ? await prisma.session.findFirst({
            where: { id: filters.sessionId, schoolId },
            select: { id: true, startDate: true },
          })
        : await prisma.session.findFirst({
            where: { schoolId, isCurrent: true },
            select: { id: true, startDate: true },
          })

      if (!typeSession) {
        throw new Error("Choose a session before filtering by new or returning students")
      }
    }

    const charges = await prisma.studentCharge.findMany({
      where: {
        schoolId,
        balance: { gt: 0 },
        status: { in: ["UNPAID", "PARTIAL"] },
        ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(filters?.termId ? { termId: filters.termId } : {}),
        ...(filters?.classTermId ? { classTermId: filters.classTermId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        finalAmountDue: true,
        amountPaid: true,
        discountAmount: true,
        exemptedAmount: true,
        balance: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            parents: {
              take: 1,
              select: { parent: { select: { user: { select: { phone: true } } } } },
            },
          },
        },
        classTerm: { select: { class: { select: { name: true } } } },
      },
    })

    const lastPayments = await prisma.payment.groupBy({
      by: ["studentId"],
      where: { schoolId, status: "COMPLETED" },
      _max: { paymentDate: true },
    })
    const lastPaymentByStudent = new Map(lastPayments.map((payment) => [payment.studentId, payment._max.paymentDate]))

    const rows = new Map<string, {
      studentId: string
      studentName: string
      admissionNo: string
      className: string | null
      parentContact: string | null
      totalFees: Prisma.Decimal
      totalPaid: Prisma.Decimal
      discounts: Prisma.Decimal
      exemptions: Prisma.Decimal
      balance: Prisma.Decimal
      lastPaymentDate: string | null
    }>()

    for (const charge of charges) {
      const existing = rows.get(charge.student.id)
      const base = existing ?? {
        studentId: charge.student.id,
        studentName: `${charge.student.user.firstName} ${charge.student.user.lastName}`,
        admissionNo: charge.student.admissionNo,
        className: charge.classTerm?.class.name ?? null,
        parentContact: charge.student.parents[0]?.parent.user.phone ?? null,
        totalFees: money(0),
        totalPaid: money(0),
        discounts: money(0),
        exemptions: money(0),
        balance: money(0),
        lastPaymentDate: lastPaymentByStudent.get(charge.student.id)?.toISOString() ?? null,
      }

      base.totalFees = base.totalFees.plus(charge.finalAmountDue)
      base.totalPaid = base.totalPaid.plus(charge.amountPaid)
      base.discounts = base.discounts.plus(charge.discountAmount)
      base.exemptions = base.exemptions.plus(charge.exemptedAmount)
      base.balance = base.balance.plus(charge.balance)
      rows.set(charge.student.id, base)
    }

    // The remaining filters are applied to the aggregated student, not to single charges:
    // someone owing 2,000 across four fees is a 2,000 debtor, not four small ones.
    let debtors = Array.from(rows.values())

    if (filters?.paymentStatus === "UNPAID") {
      debtors = debtors.filter((row) => row.totalPaid.isZero())
    } else if (filters?.paymentStatus === "PARTIAL") {
      debtors = debtors.filter((row) => row.totalPaid.gt(0))
    }

    if (filters?.minBalance != null) {
      const threshold = money(filters.minBalance)
      debtors = debtors.filter((row) => row.balance.gte(threshold))
    }

    if (typeSession) {
      const returning = await returningStudentIds(
        debtors.map((row) => row.studentId),
        schoolId,
        typeSession.startDate,
      )
      debtors = debtors.filter((row) =>
        filters?.studentType === "RETURNING_STUDENTS"
          ? returning.has(row.studentId)
          : !returning.has(row.studentId),
      )
    }

    return {
      success: true,
      data: debtors
        .sort((a, b) => b.balance.comparedTo(a.balance))
        .map((row) => ({
          ...row,
          totalFees: moneyString(row.totalFees),
          totalPaid: moneyString(row.totalPaid),
          discounts: moneyString(row.discounts),
          exemptions: moneyString(row.exemptions),
          balance: moneyString(row.balance),
        })),
    }
  } catch (error) {
    return toError(error, "Failed to load debtors report")
  }
}

export async function getClassPaymentSummary(filters?: { termId?: string | null }): Promise<ActionResult<Array<{
  classTermId: string
  className: string
  termName: string
  students: number
  expected: string
  paid: string
  outstanding: string
  paidCount: number
  partialCount: number
  unpaidCount: number
  collectionRate: number
}>>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const charges = await prisma.studentCharge.findMany({
      where: {
        schoolId,
        classTermId: { not: null },
        ...(filters?.termId ? { termId: filters.termId } : {}),
      },
      select: {
        studentId: true,
        classTermId: true,
        finalAmountDue: true,
        amountPaid: true,
        balance: true,
        status: true,
        classTerm: { select: { id: true, class: { select: { name: true } }, term: { select: { name: true } } } },
      },
    })

    const groups = new Map<string, {
      classTermId: string
      className: string
      termName: string
      studentIds: Set<string>
      expected: Prisma.Decimal
      paid: Prisma.Decimal
      outstanding: Prisma.Decimal
      paidCount: number
      partialCount: number
      unpaidCount: number
    }>()

    for (const charge of charges) {
      if (!charge.classTermId || !charge.classTerm) continue
      const group = groups.get(charge.classTermId) ?? {
        classTermId: charge.classTermId,
        className: charge.classTerm.class.name,
        termName: charge.classTerm.term.name,
        studentIds: new Set<string>(),
        expected: money(0),
        paid: money(0),
        outstanding: money(0),
        paidCount: 0,
        partialCount: 0,
        unpaidCount: 0,
      }
      group.studentIds.add(charge.studentId)
      group.expected = group.expected.plus(charge.finalAmountDue)
      group.paid = group.paid.plus(charge.amountPaid)
      group.outstanding = group.outstanding.plus(charge.balance)
      if (charge.status === "PAID") group.paidCount += 1
      if (charge.status === "PARTIAL") group.partialCount += 1
      if (charge.status === "UNPAID") group.unpaidCount += 1
      groups.set(charge.classTermId, group)
    }

    return {
      success: true,
      data: Array.from(groups.values()).map((group) => ({
        classTermId: group.classTermId,
        className: group.className,
        termName: group.termName,
        students: group.studentIds.size,
        expected: moneyString(group.expected),
        paid: moneyString(group.paid),
        outstanding: moneyString(group.outstanding),
        paidCount: group.paidCount,
        partialCount: group.partialCount,
        unpaidCount: group.unpaidCount,
        collectionRate: group.expected.gt(0) ? group.paid.div(group.expected).mul(100).toDecimalPlaces(1).toNumber() : 0,
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load class payment summary")
  }
}

export async function getAccumulatedFundReport(filters?: { sessionId?: string | null }): Promise<ActionResult<{
  terms: Array<{
    termId: string
    termName: string
    sessionName: string
    scheduledFees: string
    discounts: string
    exemptions: string
    netExpected: string
    paid: string
    outstanding: string
  }>
  sessionTotals: {
    scheduledFees: string
    discounts: string
    exemptions: string
    netExpected: string
    paid: string
    outstanding: string
  }
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const charges = await prisma.studentCharge.findMany({
      where: {
        schoolId,
        ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
      },
      select: {
        originalAmount: true,
        discountAmount: true,
        exemptedAmount: true,
        finalAmountDue: true,
        amountPaid: true,
        balance: true,
        termId: true,
        term: { select: { name: true, session: { select: { name: true } } } },
      },
    })

    const groups = new Map<string, {
      termId: string
      termName: string
      sessionName: string
      scheduledFees: Prisma.Decimal
      discounts: Prisma.Decimal
      exemptions: Prisma.Decimal
      netExpected: Prisma.Decimal
      paid: Prisma.Decimal
      outstanding: Prisma.Decimal
    }>()

    const totals = {
      scheduledFees: money(0),
      discounts: money(0),
      exemptions: money(0),
      netExpected: money(0),
      paid: money(0),
      outstanding: money(0),
    }

    for (const charge of charges) {
      const key = charge.termId ?? "no-term"
      const group = groups.get(key) ?? {
        termId: key,
        termName: charge.term?.name ?? "No term",
        sessionName: charge.term?.session.name ?? "No session",
        scheduledFees: money(0),
        discounts: money(0),
        exemptions: money(0),
        netExpected: money(0),
        paid: money(0),
        outstanding: money(0),
      }

      group.scheduledFees = group.scheduledFees.plus(charge.originalAmount)
      group.discounts = group.discounts.plus(charge.discountAmount)
      group.exemptions = group.exemptions.plus(charge.exemptedAmount)
      group.netExpected = group.netExpected.plus(charge.finalAmountDue)
      group.paid = group.paid.plus(charge.amountPaid)
      group.outstanding = group.outstanding.plus(charge.balance)
      groups.set(key, group)

      totals.scheduledFees = totals.scheduledFees.plus(charge.originalAmount)
      totals.discounts = totals.discounts.plus(charge.discountAmount)
      totals.exemptions = totals.exemptions.plus(charge.exemptedAmount)
      totals.netExpected = totals.netExpected.plus(charge.finalAmountDue)
      totals.paid = totals.paid.plus(charge.amountPaid)
      totals.outstanding = totals.outstanding.plus(charge.balance)
    }

    return {
      success: true,
      data: {
        terms: Array.from(groups.values()).map((term) => ({
          termId: term.termId,
          termName: term.termName,
          sessionName: term.sessionName,
          scheduledFees: moneyString(term.scheduledFees),
          discounts: moneyString(term.discounts),
          exemptions: moneyString(term.exemptions),
          netExpected: moneyString(term.netExpected),
          paid: moneyString(term.paid),
          outstanding: moneyString(term.outstanding),
        })),
        sessionTotals: {
          scheduledFees: moneyString(totals.scheduledFees),
          discounts: moneyString(totals.discounts),
          exemptions: moneyString(totals.exemptions),
          netExpected: moneyString(totals.netExpected),
          paid: moneyString(totals.paid),
          outstanding: moneyString(totals.outstanding),
        },
      },
    }
  } catch (error) {
    return toError(error, "Failed to load accumulated fund report")
  }
}

export async function getReceipt(paymentId: string): Promise<ActionResult<{
  id: string
  receiptNo: string
  amount: string
  paymentDate: string
  paymentMethod: string
  referenceNo: string | null
  receivedBy: string | null
  student: { name: string; admissionNo: string; currentClass: string | null }
  school: { name: string; code: string; logoUrl: string | null }
  term: { name: string; sessionName: string }
  allocations: Array<{ description: string; amount: string }>
  balanceRemaining: string
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, schoolId },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        referenceNo: true,
        receivedByUser: { select: { firstName: true, lastName: true } },
        student: {
          select: {
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            charges: { select: { balance: true } },
            classTerms: {
              where: { status: "ACTIVE" },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { classTerm: { select: { class: { select: { name: true } } } } },
            },
          },
        },
        school: { select: { name: true, code: true, logoUrl: true } },
        term: { select: { name: true, session: { select: { name: true } } } },
        allocations: {
          select: {
            amount: true,
            charge: { select: { feeSchedule: { select: { name: true } } } },
          },
        },
      },
    })

    if (!payment) throw new Error("Receipt not found")

    return {
      success: true,
      data: {
        id: payment.id,
        receiptNo: payment.receiptNo,
        amount: moneyString(payment.amount),
        paymentDate: payment.paymentDate.toISOString(),
        paymentMethod: payment.paymentMethod,
        referenceNo: payment.referenceNo,
        receivedBy: payment.receivedByUser
          ? `${payment.receivedByUser.firstName} ${payment.receivedByUser.lastName}`
          : null,
        student: {
          name: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
          admissionNo: payment.student.admissionNo,
          currentClass: payment.student.classTerms[0]?.classTerm.class.name ?? null,
        },
        school: payment.school,
        term: { name: payment.term.name, sessionName: payment.term.session.name },
        allocations: payment.allocations.map((allocation) => ({
          description: allocation.charge.feeSchedule.name,
          amount: moneyString(allocation.amount),
        })),
        balanceRemaining: moneyString(payment.student.charges.reduce((total, charge) => total.plus(charge.balance), money(0))),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load receipt")
  }
}

/**
 * Finance staff.
 *
 * An admin holds every power in their school, finance included; an accountant is someone
 * the admin assigns finance to and nothing else. That assignment is what these actions
 * manage, which is why they are gated by requireFinanceManager rather than living in
 * user-management with the platform-wide super-admin tools.
 *
 * An accountant hangs off the same Admin profile row as an admin (see lib/authz.ts) —
 * the row carries the school; the User.role decides what they can reach.
 */
export async function getFinanceOfficers(): Promise<ActionResult<Array<{
  userId: string
  name: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
}>>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)

    const officers = await prisma.admin.findMany({
      where: { schoolId, user: { role: "ACCOUNTANT" } },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
            createdAt: true,
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { user: { createdAt: "desc" } },
    })

    return {
      success: true,
      data: officers.map(({ user }) => ({
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.credentials[0]?.value ?? null,
        phone: user.phone,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load finance staff")
  }
}

export async function createFinanceOfficer(input: unknown): Promise<ActionResult<{
  userId: string
  defaultPassword: string
}>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = financeOfficerSchema.parse(input)

    // Credential.value is unique platform-wide, not per school, so this has to be checked
    // before the transaction rather than relying on a scoped uniqueness constraint.
    const existing = await prisma.credential.findUnique({
      where: { value: data.email },
      select: { id: true },
    })
    if (existing) {
      throw new Error("That email is already in use")
    }

    // Matches createAdminUser: first sign-in uses the current year, and the account is
    // expected to change it. Nothing here should ever mint a password the admin picks.
    const defaultPassword = new Date().getFullYear().toString()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          role: "ACCOUNTANT",
          isActive: true,
        },
        select: { id: true },
      })

      await tx.credential.create({
        data: {
          userId: created.id,
          type: "EMAIL",
          value: data.email,
          passwordHash,
          isPrimary: true,
        },
      })

      await tx.admin.create({
        data: {
          userId: created.id,
          schoolId,
          permissions: JSON.stringify(["FINANCE"]),
        },
      })

      return created
    })

    revalidateFinance("/staff")
    return { success: true, data: { userId: user.id, defaultPassword } }
  } catch (error) {
    return toError(error, "Failed to create finance staff")
  }
}

/**
 * Deactivation rather than deletion: an accountant's name is on receipts and discount
 * approvals, and those records have to keep resolving. requireActor rejects an inactive
 * user on their next request, so access stops without touching the history.
 */
export async function setFinanceOfficerActive(input: unknown): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = z.object({ userId: z.string().min(1), isActive: z.boolean() }).parse(input)

    // Scoped to this school and to the accountant role, so the same action cannot be
    // pointed at an admin or at another school's staff.
    const officer = await prisma.admin.findFirst({
      where: { userId: data.userId, schoolId, user: { role: "ACCOUNTANT" } },
      select: { id: true },
    })
    if (!officer) {
      throw new Error("Finance staff not found in this school")
    }

    await prisma.user.update({
      where: { id: data.userId },
      data: { isActive: data.isActive },
    })

    revalidateFinance("/staff")
    return { success: true, data: { isActive: data.isActive } }
  } catch (error) {
    return toError(error, "Failed to update finance staff")
  }
}

/**
 * The receipt register: every receipt raised, newest first.
 *
 * Added because a receipt was previously only reachable if you already knew which payment
 * it belonged to — there was no way to answer "find me receipt RCPT-2026-00007".
 */
export async function getReceiptRegister(filters?: { termId?: string | null; search?: string | null }): Promise<
  ActionResult<Array<{
    id: string
    receiptNo: string
    studentId: string
    studentName: string
    admissionNo: string
    className: string | null
    amount: string
    paymentDate: string
    method: string
    status: string
    receivedByName: string | null
  }>>
> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const search = filters?.search?.trim()

    const payments = await prisma.payment.findMany({
      where: {
        schoolId,
        ...(filters?.termId ? { termId: filters.termId } : {}),
        ...(search
          ? {
              OR: [
                { receiptNo: { contains: search } },
                { referenceNo: { contains: search } },
                { student: { admissionNo: { contains: search } } },
                { student: { user: { firstName: { contains: search } } } },
                { student: { user: { lastName: { contains: search } } } },
              ],
            }
          : {}),
      },
      orderBy: { paymentDate: "desc" },
      take: 500,
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        status: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            classTerms: {
              where: { status: "ACTIVE" },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { classTerm: { select: { class: { select: { name: true } } } } },
            },
          },
        },
        receivedByUser: { select: { firstName: true, lastName: true } },
      },
    })

    return {
      success: true,
      data: payments.map((payment) => ({
        id: payment.id,
        receiptNo: payment.receiptNo,
        studentId: payment.student.id,
        studentName: `${payment.student.user.firstName} ${payment.student.user.lastName}`,
        admissionNo: payment.student.admissionNo,
        className: payment.student.classTerms[0]?.classTerm.class.name ?? null,
        amount: moneyString(payment.amount),
        paymentDate: payment.paymentDate.toISOString(),
        method: payment.paymentMethod,
        status: payment.status,
        receivedByName: payment.receivedByUser
          ? `${payment.receivedByUser.firstName} ${payment.receivedByUser.lastName}`
          : null,
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load the receipt register")
  }
}
