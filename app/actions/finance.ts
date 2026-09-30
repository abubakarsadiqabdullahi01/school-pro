"use server"

import { Prisma, type FeeAppliesTo, type FeeType, type PaymentStatus } from "@prisma/client"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { AuthorizationError, requirePermission, type Actor } from "@/lib/authz"
import { paymentMethodVariants } from "@/lib/finance/payment-method"
import { postStudentPaymentInTransaction } from "@/lib/finance/payment-ledger.server"
import { queuePaymentReceiptInTransaction, queueRefundNoticeInTransaction } from "@/lib/notifications/payment-receipt.server"
import { canDeleteFinanceOfficer, canUseOfficerEmail } from "@/lib/finance/finance-staff-rules"
import {
  feeScheduleScopeWhere,
  summariseCoverage,
  type Coverage,
  type CoverageRow,
} from "@/lib/finance/fee-scope"
import {
  canDeactivateFeeCategory,
  canDeleteFeeCategory,
  canDeleteFeeSchedule,
  canRepointFeeSchedule,
  canUseFeeCategoryName,
} from "@/lib/finance/fee-setup-rules"
import { getActiveSchool } from "@/lib/school-context.server"
import { recordAudit } from "@/lib/audit"
import { generateTemporaryPassword } from "@/lib/temporary-password"
import { revokeAllSessionsForUser } from "@/lib/sessions.server"
import { loadReceipt, type ReceiptDocument } from "@/lib/finance/receipt-document.server"
import { loginBlockedByEmployment, provisionedStaffNo, provisionStaffForLogin } from "@/lib/hr/staff-provisioning"

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

const feeCategoryUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().nullable(),
  type: z.enum(["MANDATORY", "OPTIONAL", "REGISTRATION", "SERVICE"]),
  isActive: z.coerce.boolean(),
})

const feeScheduleUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  amount: moneySchema,
  dueDate: z.coerce.date().optional().nullable(),
  isMandatory: z.coerce.boolean(),
  isActive: z.coerce.boolean(),
  // Only read while the schedule has raised nothing; see `canRepointFeeSchedule`.
  sessionId: z.string().min(1).optional().nullable(),
  termId: z.string().min(1).optional().nullable(),
  classTermId: z.string().min(1).optional().nullable(),
  categoryId: z.string().min(1).optional().nullable(),
  appliesTo: z.enum(["NEW_STUDENTS", "RETURNING_STUDENTS", "ALL_STUDENTS"]).optional().nullable(),
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

const refundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
  referenceNo: z.string().trim().max(120).optional().nullable(),
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
        ? prisma.term.findFirst({ where: { id: data.termId, session: { schoolId } }, select: { id: true, sessionId: true } })
        : Promise.resolve(null),
      data.classTermId
        ? prisma.classTerm.findFirst({
            where: { id: data.classTermId, class: { schoolId } },
            select: { id: true, termId: true, term: { select: { sessionId: true } } },
          })
        : Promise.resolve(null),
      prisma.feeCategory.findFirst({ where: { id: data.categoryId, schoolId }, select: { id: true } }),
    ])

    if (!session) throw new Error("Session not found")
    if (data.termId && !term) throw new Error("Term not found")
    if (data.classTermId && !classTerm) throw new Error("Class term not found")
    if (!category) throw new Error("Fee category not found")
    if (term && term.sessionId !== session.id) {
      throw new Error("The selected term does not belong to the selected session")
    }
    if (classTerm && classTerm.term.sessionId !== session.id) {
      throw new Error("The selected class term does not belong to the selected session")
    }
    if (classTerm && data.termId && classTerm.termId !== data.termId) {
      throw new Error("The selected class term does not belong to the selected term")
    }

    const effectiveTermId = data.termId ?? classTerm?.termId ?? null
    // One scope rule, shared with the catch-up and with the coverage figures, so what a
    // schedule bills and what the screens say it bills cannot drift apart.
    const enrolledStudents = await prisma.studentClassTerm.findMany({
      where: feeScheduleScopeWhere(
        { sessionId: data.sessionId, termId: effectiveTermId, classTermId: data.classTermId ?? null },
        schoolId,
      ),
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
 * How far each schedule's billing reaches, for a list of them.
 *
 * Batched deliberately: the enrolments and the charges are read once for the whole list and
 * the scopes are applied in memory, so adding schedules does not add queries. The figure
 * this produces is the one the list leans on — "60 billed" means nothing without "of how
 * many", and the gap is the only warning anybody gets that a student admitted last week owes
 * nothing on paper.
 */
async function coverageForSchedules(
  schedules: Array<{ id: string; sessionId: string; termId: string | null; classTermId: string | null; appliesTo: string }>,
  schoolId: string,
): Promise<Map<string, { inScope: number; billed: number; unbilled: number }>> {
  const coverage = new Map<string, { inScope: number; billed: number; unbilled: number }>()
  if (schedules.length === 0) return coverage

  const sessionIds = [...new Set(schedules.map((schedule) => schedule.sessionId))]

  const [enrolments, charges, sessions] = await Promise.all([
    prisma.studentClassTerm.findMany({
      where: {
        status: "ACTIVE",
        student: { schoolId, user: { isActive: true } },
        term: { sessionId: { in: sessionIds } },
      },
      select: {
        studentId: true,
        classTermId: true,
        termId: true,
        term: { select: { sessionId: true } },
        classTerm: { select: { class: { select: { name: true } } } },
      },
    }),
    prisma.studentCharge.findMany({
      where: { feeScheduleId: { in: schedules.map((schedule) => schedule.id) } },
      select: { feeScheduleId: true, studentId: true },
    }),
    prisma.session.findMany({ where: { id: { in: sessionIds } }, select: { id: true, startDate: true } }),
  ])

  // "Returning" is relative to a session, so it is resolved once per session rather than
  // once per schedule.
  const returningBySession = new Map<string, Set<string>>()
  for (const session of sessions) {
    const studentsInSession = enrolments
      .filter((enrolment) => enrolment.term.sessionId === session.id)
      .map((enrolment) => enrolment.studentId)
    returningBySession.set(
      session.id,
      await returningStudentIds(studentsInSession, schoolId, session.startDate),
    )
  }

  const billedBySchedule = new Map<string, Set<string>>()
  for (const charge of charges) {
    const set = billedBySchedule.get(charge.feeScheduleId) ?? new Set<string>()
    set.add(charge.studentId)
    billedBySchedule.set(charge.feeScheduleId, set)
  }

  for (const schedule of schedules) {
    const returning = returningBySession.get(schedule.sessionId) ?? new Set<string>()
    const rows: CoverageRow[] = enrolments
      .filter((enrolment) =>
        schedule.classTermId
          ? enrolment.classTermId === schedule.classTermId
          : schedule.termId
            ? enrolment.termId === schedule.termId
            : enrolment.term.sessionId === schedule.sessionId,
      )
      .filter((enrolment) =>
        schedule.appliesTo === "ALL_STUDENTS"
          ? true
          : schedule.appliesTo === "RETURNING_STUDENTS"
            ? returning.has(enrolment.studentId)
            : !returning.has(enrolment.studentId),
      )
      .map((enrolment) => ({
        studentId: enrolment.studentId,
        className: enrolment.classTerm.class.name,
      }))

    const summary = summariseCoverage(rows, billedBySchedule.get(schedule.id) ?? new Set())
    coverage.set(schedule.id, {
      inScope: summary.inScope,
      billed: summary.billed,
      unbilled: summary.unbilled,
    })
  }

  return coverage
}

export type FeeScheduleCoverage = Coverage & {
  schedule: {
    id: string
    name: string
    scopeLabel: string
    sessionName: string
    categoryName: string
    amount: string
    appliesTo: string
    isActive: boolean
    dueDate: string | null
  }
  /** Who is in scope with no charge. Capped, because the answer is "run the catch-up". */
  unbilledStudents: Array<{ id: string; name: string; admissionNo: string; className: string }>
  unbilledShown: number
}

/**
 * Who this schedule covers, who it has billed, and who it has missed.
 *
 * The screen this feeds exists because of one failure mode: a student admitted after a
 * schedule ran owes nothing on paper, the class summary balances, and nobody notices until
 * the parent is never asked for the money. The unbilled list names them.
 */
export async function getFeeScheduleCoverage(id: string): Promise<ActionResult<FeeScheduleCoverage>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const schedule = await prisma.feeSchedule.findFirst({
      where: { id, schoolId },
      select: {
        id: true,
        name: true,
        amount: true,
        appliesTo: true,
        isActive: true,
        dueDate: true,
        sessionId: true,
        termId: true,
        classTermId: true,
        category: { select: { name: true } },
        session: { select: { name: true, startDate: true } },
        term: { select: { name: true } },
        classTerm: { select: { class: { select: { name: true } }, term: { select: { name: true } } } },
      },
    })

    if (!schedule) throw new Error("Fee schedule not found")

    const [enrolments, charges] = await Promise.all([
      prisma.studentClassTerm.findMany({
        where: feeScheduleScopeWhere(schedule, schoolId),
        select: {
          studentId: true,
          classTerm: { select: { class: { select: { name: true } } } },
          student: {
            select: { id: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      prisma.studentCharge.findMany({ where: { feeScheduleId: id }, select: { studentId: true } }),
    ]);

    const returning = await returningStudentIds(
      enrolments.map((enrolment) => enrolment.studentId),
      schoolId,
      schedule.session.startDate,
    )

    const inScopeEnrolments = enrolments.filter((enrolment) =>
      schedule.appliesTo === "ALL_STUDENTS"
        ? true
        : schedule.appliesTo === "RETURNING_STUDENTS"
          ? returning.has(enrolment.studentId)
          : !returning.has(enrolment.studentId),
    )

    const billedStudentIds = new Set(charges.map((charge) => charge.studentId))
    const coverage = summariseCoverage(
      inScopeEnrolments.map((enrolment) => ({
        studentId: enrolment.studentId,
        className: enrolment.classTerm.class.name,
      })),
      billedStudentIds,
    )

    const seen = new Set<string>()
    const unbilledStudents = inScopeEnrolments
      .filter((enrolment) => !billedStudentIds.has(enrolment.studentId))
      .filter((enrolment) => {
        // A whole-session scope holds one row per term; the student is named once.
        if (seen.has(enrolment.studentId)) return false
        seen.add(enrolment.studentId)
        return true
      })
      .map((enrolment) => ({
        id: enrolment.student.id,
        name: `${enrolment.student.user.firstName} ${enrolment.student.user.lastName}`,
        admissionNo: enrolment.student.admissionNo,
        className: enrolment.classTerm.class.name,
      }))
      .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name))

    return {
      success: true,
      data: {
        ...coverage,
        schedule: {
          id: schedule.id,
          name: schedule.name,
          scopeLabel: schedule.classTerm
            ? `${schedule.classTerm.class.name} · ${schedule.classTerm.term.name}`
            : schedule.term
              ? `All classes · ${schedule.term.name}`
              : "Whole session",
          sessionName: schedule.session.name,
          categoryName: schedule.category.name,
          amount: moneyString(schedule.amount),
          appliesTo: schedule.appliesTo,
          isActive: schedule.isActive,
          dueDate: schedule.dueDate?.toISOString() ?? null,
        },
        unbilledStudents: unbilledStudents.slice(0, 200),
        unbilledShown: Math.min(unbilledStudents.length, 200),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the fee schedule coverage")
  }
}

export type FeeCategoryRow = {
  id: string
  name: string
  description: string | null
  type: string
  isActive: boolean
  scheduleCount: number
  activeScheduleCount: number
  createdAt: string
}

/**
 * The fee categories, with how much is hanging off each one.
 *
 * The counts are the reason this exists rather than reusing the setup list: a category is
 * only worth keeping if something bills against it, and one with schedules attached cannot
 * simply be retired — the schedules would lose the group they are reported under.
 */
export async function getFeeCategories(filters?: {
  search?: string | null
  type?: string | null
  status?: string | null
}): Promise<ActionResult<{ rows: FeeCategoryRow[]; totalCount: number }>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const search = filters?.search?.trim()

    const where: Prisma.FeeCategoryWhereInput = {
      schoolId,
      ...(filters?.type ? { type: filters.type as FeeType } : {}),
      ...(filters?.status ? { isActive: filters.status === "ACTIVE" } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] } : {}),
    }

    const [categories, totalCount] = await Promise.all([
      prisma.feeCategory.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          isActive: true,
          createdAt: true,
          feeSchedules: { select: { isActive: true } },
        },
      }),
      prisma.feeCategory.count({ where: { schoolId } }),
    ])

    return {
      success: true,
      data: {
        rows: categories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          type: category.type,
          isActive: category.isActive,
          scheduleCount: category.feeSchedules.length,
          activeScheduleCount: category.feeSchedules.filter((schedule) => schedule.isActive).length,
          createdAt: category.createdAt.toISOString(),
        })),
        totalCount,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load fee categories")
  }
}

export type FeeScheduleRow = {
  id: string
  name: string
  description: string | null
  categoryId: string
  categoryName: string
  sessionId: string
  sessionName: string
  termId: string | null
  termName: string | null
  className: string | null
  /** CLASS, TERM or SESSION — how widely the schedule bills. */
  scope: string
  scopeLabel: string
  amount: string
  appliesTo: string
  isMandatory: boolean
  isActive: boolean
  dueDate: string | null
  chargeCount: number
  /** Students the scope covers right now. */
  inScope: number
  /** In scope with no charge — somebody admitted after the schedule ran. */
  unbilled: number
}

/**
 * The fee schedules already set up, with how many students each has billed.
 *
 * Fee Setup listed categories only, so a schedule could not be seen after it was created —
 * which is also why nobody noticed that students admitted later were never billed against
 * it. The charge count is the number that makes that visible: compare it with the class roll.
 */
export async function getFeeSchedules(filters?: {
  search?: string | null
  sessionId?: string | null
  termId?: string | null
  categoryId?: string | null
  audience?: string | null
  /** CLASS, TERM or SESSION. */
  scope?: string | null
  status?: string | null
}): Promise<
  ActionResult<{
    rows: FeeScheduleRow[]
    totalCount: number
    activeCount: number
    studentsBilled: number
    /** Students in scope of an active schedule with no charge against it. */
    studentsUnbilled: number
  }>
> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const search = filters?.search?.trim()

    // Scope is not a column: it is which of the two period columns a schedule carries.
    const scopeWhere: Prisma.FeeScheduleWhereInput =
      filters?.scope === "CLASS"
        ? { classTermId: { not: null } }
        : filters?.scope === "TERM"
          ? { classTermId: null, termId: { not: null } }
          : filters?.scope === "SESSION"
            ? { classTermId: null, termId: null }
            : {}

    const where: Prisma.FeeScheduleWhereInput = {
      schoolId,
      ...scopeWhere,
      ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(filters?.termId ? { termId: filters.termId } : {}),
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters?.audience ? { appliesTo: filters.audience as FeeAppliesTo } : {}),
      ...(filters?.status ? { isActive: filters.status === "ACTIVE" } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
              { category: { name: { contains: search } } },
              { classTerm: { class: { name: { contains: search } } } },
            ],
          }
        : {}),
    }

    const [schedules, totalCount] = await Promise.all([
      prisma.feeSchedule.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          amount: true,
          appliesTo: true,
          isMandatory: true,
          isActive: true,
          dueDate: true,
          categoryId: true,
          sessionId: true,
          termId: true,
          classTermId: true,
          category: { select: { name: true } },
          session: { select: { name: true } },
          term: { select: { name: true } },
          classTerm: { select: { class: { select: { name: true } }, term: { select: { name: true } } } },
          _count: { select: { charges: true } },
        },
      }),
      prisma.feeSchedule.count({ where: { schoolId } }),
    ])

    const coverage = await coverageForSchedules(schedules, schoolId)

    const rows: FeeScheduleRow[] = schedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      description: schedule.description,
      categoryId: schedule.categoryId,
      categoryName: schedule.category.name,
      sessionId: schedule.sessionId,
      sessionName: schedule.session.name,
      termId: schedule.termId,
      termName: schedule.term?.name ?? schedule.classTerm?.term.name ?? null,
      className: schedule.classTerm?.class.name ?? null,
      scope: schedule.classTermId ? "CLASS" : schedule.termId ? "TERM" : "SESSION",
      // Scope reads the way it was set: one class, a whole term, or the session.
      scopeLabel: schedule.classTerm
        ? `${schedule.classTerm.class.name} · ${schedule.classTerm.term.name}`
        : schedule.term
          ? `All classes · ${schedule.term.name}`
          : "Whole session",
      amount: moneyString(schedule.amount),
      appliesTo: schedule.appliesTo,
      isMandatory: schedule.isMandatory,
      isActive: schedule.isActive,
      dueDate: schedule.dueDate?.toISOString() ?? null,
      chargeCount: schedule._count.charges,
      inScope: coverage.get(schedule.id)?.inScope ?? 0,
      unbilled: coverage.get(schedule.id)?.unbilled ?? 0,
    }))

    return {
      success: true,
      data: {
        rows,
        totalCount,
        activeCount: rows.filter((row) => row.isActive).length,
        studentsBilled: rows.reduce((sum, row) => sum + row.chargeCount, 0),
        // Only active schedules: an inactive one is not billing anybody by design, so
        // counting its gap would raise an alarm about a decision somebody already made.
        studentsUnbilled: rows
          .filter((row) => row.isActive)
          .reduce((sum, row) => sum + row.unbilled, 0),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load fee schedules")
  }
}

export type FeeCategoryDetail = {
  id: string
  name: string
  description: string | null
  type: string
  isActive: boolean
  scheduleCount: number
  activeScheduleCount: number
  discountCount: number
  exemptionCount: number
  /** Every category name in the school, so the form can catch a clash before it submits. */
  takenNames: Array<{ id: string; name: string }>
  /** What actually reports under it — the answer to "1 schedule, but which one?". */
  schedules: Array<{
    id: string
    name: string
    scopeLabel: string
    sessionName: string
    amount: string
    isActive: boolean
    chargeCount: number
  }>
}

/** One category, with everything the edit screen needs to say what may be done to it. */
export async function getFeeCategory(id: string): Promise<ActionResult<FeeCategoryDetail>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const [category, takenNames] = await Promise.all([
      prisma.feeCategory.findFirst({
        where: { id, schoolId },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          isActive: true,
          feeSchedules: {
            orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              name: true,
              amount: true,
              isActive: true,
              session: { select: { name: true } },
              term: { select: { name: true } },
              classTerm: { select: { class: { select: { name: true } }, term: { select: { name: true } } } },
              _count: { select: { charges: true } },
            },
          },
          _count: { select: { discounts: true, exemptions: true } },
        },
      }),
      prisma.feeCategory.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ])

    if (!category) throw new Error("Fee category not found")

    return {
      success: true,
      data: {
        id: category.id,
        name: category.name,
        description: category.description,
        type: category.type,
        isActive: category.isActive,
        scheduleCount: category.feeSchedules.length,
        activeScheduleCount: category.feeSchedules.filter((schedule) => schedule.isActive).length,
        discountCount: category._count.discounts,
        exemptionCount: category._count.exemptions,
        takenNames,
        schedules: category.feeSchedules.map((schedule) => ({
          id: schedule.id,
          name: schedule.name,
          scopeLabel: schedule.classTerm
            ? `${schedule.classTerm.class.name} · ${schedule.classTerm.term.name}`
            : schedule.term
              ? `All classes · ${schedule.term.name}`
              : "Whole session",
          sessionName: schedule.session.name,
          amount: moneyString(schedule.amount),
          isActive: schedule.isActive,
          chargeCount: schedule._count.charges,
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the fee category")
  }
}

/**
 * Renames a category, retypes it, or switches it off.
 *
 * Nothing here touches money: a category is a heading, and the schedules under it keep their
 * amounts whatever it is called. Switching one off is the safe alternative to deleting it,
 * which is why the rule about active schedules is enforced rather than warned about.
 */
export async function updateFeeCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = feeCategoryUpdateSchema.parse(input)

    const [existing, takenNames] = await Promise.all([
      prisma.feeCategory.findFirst({
        where: { id: data.id, schoolId },
        select: { id: true, isActive: true, feeSchedules: { select: { isActive: true } } },
      }),
      prisma.feeCategory.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ])

    if (!existing) throw new Error("Fee category not found")

    const nameVerdict = canUseFeeCategoryName(data.name, takenNames, data.id)
    if (!nameVerdict.allowed) throw new Error(nameVerdict.reason)

    if (existing.isActive && !data.isActive) {
      const verdict = canDeactivateFeeCategory({
        activeScheduleCount: existing.feeSchedules.filter((schedule) => schedule.isActive).length,
      })
      if (!verdict.allowed) throw new Error(verdict.reason)
    }

    await prisma.feeCategory.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description || null,
        type: data.type,
        isActive: data.isActive,
      },
    })

    revalidateFinance("/fees", "/fees/categories")
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return toError(error, "Failed to update the fee category")
  }
}

/** Deletes a category nothing points at. Anything else is refused with the reason why. */
export async function deleteFeeCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const { id } = z.object({ id: z.string().min(1) }).parse(input)

    const category = await prisma.feeCategory.findFirst({
      where: { id, schoolId },
      select: { id: true, _count: { select: { feeSchedules: true, discounts: true, exemptions: true } } },
    })

    if (!category) throw new Error("Fee category not found")

    const verdict = canDeleteFeeCategory({
      scheduleCount: category._count.feeSchedules,
      discountCount: category._count.discounts,
      exemptionCount: category._count.exemptions,
    })
    if (!verdict.allowed) throw new Error(verdict.reason)

    await prisma.feeCategory.delete({ where: { id } })

    revalidateFinance("/fees", "/fees/categories")
    return { success: true, data: { id } }
  } catch (error) {
    return toError(error, "Failed to delete the fee category")
  }
}

export type FeeScheduleDetail = {
  id: string
  name: string
  description: string | null
  amount: string
  appliesTo: string
  isMandatory: boolean
  isActive: boolean
  dueDate: string | null
  categoryId: string
  sessionId: string
  termId: string | null
  classTermId: string | null
  scope: string
  scopeLabel: string
  chargeCount: number
  /** Charges with money against them — they fix what may be done to the schedule. */
  settledCharges: number
  /** Charges carrying a discount or an exemption. */
  adjustedCharges: number
  /** Charges a new amount would reach; the rest keep the figure somebody reasoned about. */
  repriceableCharges: number
}

/** One schedule, with the counts every rule about it is decided on. */
export async function getFeeSchedule(id: string): Promise<ActionResult<FeeScheduleDetail>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const schedule = await prisma.feeSchedule.findFirst({
      where: { id, schoolId },
      select: {
        id: true,
        name: true,
        description: true,
        amount: true,
        appliesTo: true,
        isMandatory: true,
        isActive: true,
        dueDate: true,
        categoryId: true,
        sessionId: true,
        termId: true,
        classTermId: true,
        term: { select: { name: true } },
        classTerm: { select: { class: { select: { name: true } }, term: { select: { name: true } } } },
      },
    })

    if (!schedule) throw new Error("Fee schedule not found")

    // The three conditions mirror `isRepriceable`: paid, discounted or exempted is touched.
    const [chargeCount, settledCharges, adjustedCharges, repriceableCharges] = await Promise.all([
      prisma.studentCharge.count({ where: { feeScheduleId: id } }),
      prisma.studentCharge.count({ where: { feeScheduleId: id, amountPaid: { gt: 0 } } }),
      prisma.studentCharge.count({
        where: {
          feeScheduleId: id,
          OR: [{ discountAmount: { gt: 0 } }, { exemptedAmount: { gt: 0 } }],
        },
      }),
      prisma.studentCharge.count({
        where: { feeScheduleId: id, amountPaid: 0, discountAmount: 0, exemptedAmount: 0 },
      }),
    ])

    return {
      success: true,
      data: {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description,
        amount: moneyString(schedule.amount),
        appliesTo: schedule.appliesTo,
        isMandatory: schedule.isMandatory,
        isActive: schedule.isActive,
        dueDate: schedule.dueDate?.toISOString() ?? null,
        categoryId: schedule.categoryId,
        sessionId: schedule.sessionId,
        termId: schedule.termId,
        classTermId: schedule.classTermId,
        scope: schedule.classTermId ? "CLASS" : schedule.termId ? "TERM" : "SESSION",
        scopeLabel: schedule.classTerm
          ? `${schedule.classTerm.class.name} · ${schedule.classTerm.term.name}`
          : schedule.term
            ? `All classes · ${schedule.term.name}`
            : "Whole session",
        chargeCount,
        settledCharges,
        adjustedCharges,
        repriceableCharges,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the fee schedule")
  }
}

/**
 * Edits a schedule, and carries the change down to the bills it has already raised.
 *
 * A new amount reaches only the charges nobody has touched — paid, discounted and exempted
 * ones keep the figure somebody reasoned about, and the caller is told how many were left
 * alone rather than being allowed to assume the whole class moved. A new due date reaches
 * every charge still owing, because that is what a due date is for.
 *
 * Scope, category and audience may only change while the schedule has billed nobody; see
 * `canRepointFeeSchedule`.
 */
export async function updateFeeSchedule(input: unknown): Promise<
  ActionResult<{ id: string; chargesRepriced: number; chargesLeftAlone: number; dueDatesUpdated: number }>
> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = feeScheduleUpdateSchema.parse(input)

    const schedule = await prisma.feeSchedule.findFirst({
      where: { id: data.id, schoolId },
      select: { id: true, amount: true, dueDate: true, sessionId: true, termId: true, classTermId: true },
    })
    if (!schedule) throw new Error("Fee schedule not found")

    const chargeCount = await prisma.studentCharge.count({ where: { feeScheduleId: data.id } })
    const repoint = canRepointFeeSchedule({ chargeCount })

    // Only a schedule that has billed nobody may move. Anything else keeps where it points,
    // whatever the form sent — a stale tab must not be able to re-aim a live bill.
    const scopeChanged =
      repoint.allowed &&
      ((data.sessionId && data.sessionId !== schedule.sessionId) ||
        (data.termId ?? null) !== schedule.termId ||
        (data.classTermId ?? null) !== schedule.classTermId)

    if (scopeChanged) {
      const [session, term, classTerm] = await Promise.all([
        prisma.session.findFirst({ where: { id: data.sessionId ?? "", schoolId }, select: { id: true } }),
        data.termId
          ? prisma.term.findFirst({ where: { id: data.termId, session: { schoolId } }, select: { id: true, sessionId: true } })
          : Promise.resolve(null),
        data.classTermId
          ? prisma.classTerm.findFirst({
              where: { id: data.classTermId, class: { schoolId } },
              select: { id: true, termId: true, term: { select: { sessionId: true } } },
            })
          : Promise.resolve(null),
      ])

      if (!session) throw new Error("Session not found")
      if (data.termId && !term) throw new Error("Term not found")
      if (data.classTermId && !classTerm) throw new Error("Class term not found")
      if (term && term.sessionId !== session.id) {
        throw new Error("The selected term does not belong to the selected session")
      }
      if (classTerm && classTerm.term.sessionId !== session.id) {
        throw new Error("The selected class term does not belong to the selected session")
      }
      if (classTerm && data.termId && classTerm.termId !== data.termId) {
        throw new Error("The selected class term does not belong to the selected term")
      }
    }

    if (repoint.allowed && data.categoryId) {
      const category = await prisma.feeCategory.findFirst({
        where: { id: data.categoryId, schoolId },
        select: { id: true },
      })
      if (!category) throw new Error("Fee category not found")
    }

    const amount = money(data.amount)
    const amountChanged = !schedule.amount.equals(amount)
    const dueDate = data.dueDate || null
    const dueDateChanged = (schedule.dueDate?.getTime() ?? null) !== (dueDate?.getTime() ?? null)

    const result = await prisma.$transaction(async (tx) => {
      const classTermId = repoint.allowed ? (data.classTermId ?? null) : schedule.classTermId
      const termId = repoint.allowed ? (data.termId ?? null) : schedule.termId

      await tx.feeSchedule.update({
        where: { id: data.id },
        data: {
          name: data.name,
          description: data.description || null,
          amount,
          dueDate,
          isMandatory: data.isMandatory,
          isActive: data.isActive,
          ...(repoint.allowed
            ? {
                sessionId: data.sessionId ?? schedule.sessionId,
                termId,
                classTermId,
                ...(data.categoryId ? { categoryId: data.categoryId } : {}),
                ...(data.appliesTo ? { appliesTo: data.appliesTo } : {}),
              }
            : {}),
        },
      })

      // The three zeroes are `isRepriceable` said as a query: untouched charges only.
      const untouched = { feeScheduleId: data.id, amountPaid: 0, discountAmount: 0, exemptedAmount: 0 } as const

      const repriced = amountChanged
        ? await tx.studentCharge.updateMany({
            where: untouched,
            data: { originalAmount: amount, finalAmountDue: amount, balance: amount },
          })
        : { count: 0 }

      const dueDates = dueDateChanged
        ? await tx.studentCharge.updateMany({
            where: { feeScheduleId: data.id, balance: { gt: 0 } },
            data: { dueDate },
          })
        : { count: 0 }

      return { repriced: repriced.count, dueDates: dueDates.count }
    })

    revalidateFinance("/fees", "/fees/categories", "/debtors", "/class-summary")
    return {
      success: true,
      data: {
        id: data.id,
        chargesRepriced: result.repriced,
        chargesLeftAlone: amountChanged ? chargeCount - result.repriced : 0,
        dueDatesUpdated: result.dueDates,
      },
    }
  } catch (error) {
    return toError(error, "Failed to update the fee schedule")
  }
}

/**
 * Deletes a schedule and the untouched bills it raised.
 *
 * `StudentCharge.feeSchedule` is RESTRICT, so the charges go first and both go together in
 * one transaction — a half-deleted schedule would leave students owing a fee that no longer
 * exists. Anything paid or adjusted is refused long before this point.
 */
export async function deleteFeeSchedule(input: unknown): Promise<
  ActionResult<{ id: string; chargesDeleted: number }>
> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const { id } = z.object({ id: z.string().min(1) }).parse(input)

    const schedule = await prisma.feeSchedule.findFirst({ where: { id, schoolId }, select: { id: true } })
    if (!schedule) throw new Error("Fee schedule not found")

    const [chargeCount, settledCharges, adjustedCharges] = await Promise.all([
      prisma.studentCharge.count({ where: { feeScheduleId: id } }),
      prisma.studentCharge.count({ where: { feeScheduleId: id, amountPaid: { gt: 0 } } }),
      prisma.studentCharge.count({
        where: {
          feeScheduleId: id,
          OR: [{ discountAmount: { gt: 0 } }, { exemptedAmount: { gt: 0 } }],
        },
      }),
    ])

    const verdict = canDeleteFeeSchedule({ chargeCount, settledCharges, adjustedCharges })
    if (!verdict.allowed) throw new Error(verdict.reason)

    const chargesDeleted = await prisma.$transaction(async (tx) => {
      // Counted inside the transaction: the count above decided whether this was allowed,
      // this one is what actually went.
      const deleted = await tx.studentCharge.deleteMany({ where: { feeScheduleId: id } })
      await tx.feeSchedule.delete({ where: { id } })
      return deleted.count
    })

    revalidateFinance("/fees", "/debtors", "/class-summary")
    return { success: true, data: { id, chargesDeleted } }
  } catch (error) {
    return toError(error, "Failed to delete the fee schedule")
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

    // The same scope rule as the original run and as the coverage figures.
    const enrolledStudents = await prisma.studentClassTerm.findMany({
      where: feeScheduleScopeWhere(schedule, schoolId),
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

export type FinanceStudentSearchFilters = {
  query?: string | null
  /** A class in a particular term, as the class filter offers them. */
  classTermId?: string | null
  /** Only students with something outstanding — the usual reason to be on this screen. */
  owingOnly?: boolean | null
}

/**
 * Students a cashier can take money from, narrowed the way a cashier narrows them.
 *
 * A name is not always what somebody at the counter has: a parent says "JSS 1A" and a first
 * name, or hands over a receipt with an admission number. The class filter and the owing
 * filter are what make the list short enough to pick from without typing exactly.
 */
export async function searchFinanceStudents(filters?: string | FinanceStudentSearchFilters): Promise<
  ActionResult<
    Array<{
      id: string
      admissionNo: string
      name: string
      currentClass: string | null
      currentTerm: string | null
      outstanding: string
      /** Charges with something still owing — what the cashier is about to work through. */
      openCharges: number
    }>
  >
> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    // The screen used to pass a bare string; both shapes are accepted so a caller that has
    // not been updated still searches rather than silently filtering by nothing.
    const input: FinanceStudentSearchFilters = typeof filters === "string" ? { query: filters } : (filters ?? {})
    const text = input.query?.trim()

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        ...(text
          ? {
              OR: [
                { admissionNo: { contains: text } },
                { user: { firstName: { contains: text } } },
                { user: { lastName: { contains: text } } },
              ],
            }
          : {}),
        ...(input.classTermId
          ? { classTerms: { some: { classTermId: input.classTermId, status: "ACTIVE" } } }
          : {}),
        ...(input.owingOnly ? { charges: { some: { balance: { gt: 0 } } } } : {}),
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
          select: {
            classTerm: {
              select: { class: { select: { name: true } }, term: { select: { name: true } } },
            },
          },
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
        currentTerm: student.classTerms[0]?.classTerm.term.name ?? null,
        outstanding: moneyString(student.charges.reduce((total, charge) => total.plus(charge.balance), money(0))),
        openCharges: student.charges.filter((charge) => charge.balance.gt(0)).length,
      })),
    }
  } catch (error) {
    return toError(error, "Failed to search students")
  }
}

export async function getStudentStatement(studentId: string): Promise<ActionResult<{
  school: { name: string; code: string }
  student: { id: string; admissionNo: string; name: string; currentClass: string | null; currentTerm: string | null }
  /** Who produced this copy — the statement is signed electronically rather than in ink. */
  issuedBy: { name: string; role: string }
  totals: { charged: string; paid: string; discounts: string; exemptions: string; balance: string }
  charges: Array<{
    id: string
    termId: string | null
    description: string
    amount: string
    /** The fee before any discount or exemption — what a percentage is taken of. */
    originalAmount: string
    paid: string
    balance: string
    status: string
    /** When the charge row was written. Rarely the right date for a statement. */
    raisedOn: string
    dueDate: string | null
    /** The start of the term the charge belongs to, used when it has no due date. */
    termStart: string | null
    /** Which term this is a fee for, and the heading it reports under. */
    termName: string | null
    categoryName: string | null
  }>
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
            createdAt: true,
            dueDate: true,
            finalAmountDue: true,
            amountPaid: true,
            balance: true,
            discountAmount: true,
            exemptedAmount: true,
            status: true,
            originalAmount: true,
            feeSchedule: { select: { name: true, category: { select: { name: true } } } },
            term: { select: { name: true, startDate: true } },
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
        issuedBy: { name: actor.name, role: actor.role },
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
          originalAmount: moneyString(charge.originalAmount),
          paid: moneyString(charge.amountPaid),
          balance: moneyString(charge.balance),
          status: charge.status,
          raisedOn: charge.createdAt.toISOString(),
          dueDate: charge.dueDate ? charge.dueDate.toISOString() : null,
          termStart: charge.term ? charge.term.startDate.toISOString() : null,
          termName: charge.term?.name ?? null,
          categoryName: charge.feeSchedule.category?.name ?? null,
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

export type FinanceAdjustmentRow = {
  id: string
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  termName: string | null
  feeName: string
  categoryName: string | null
  /** FIXED or PERCENTAGE, with the figure that was entered. */
  type: string
  value: string
  amount: string
  reason: string
  approvedBy: string | null
  createdAt: string
}

/**
 * Every discount and exemption the school has granted.
 *
 * Money given away is money the school will never chase, so this list is a record somebody
 * answers for: who it was for, which fee, how much, why, and who approved it. The student's
 * class and the term are carried because "Tuition" alone does not say which year's tuition
 * was reduced.
 */
export async function getFinanceAdjustments(filters?: {
  termId?: string | null
  categoryId?: string | null
  /** FIXED, PERCENTAGE or, for an exemption, FULL. */
  type?: string | null
}): Promise<ActionResult<{
  discounts: FinanceAdjustmentRow[]
  exemptions: FinanceAdjustmentRow[]
}>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)

    const where = {
      schoolId,
      isActive: true,
      ...(filters?.termId ? { termId: filters.termId } : {}),
      ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
    }

    const select = {
      id: true,
      type: true,
      value: true,
      amountApplied: true,
      reason: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          user: { select: { firstName: true, lastName: true } },
          classTerms: {
            where: { status: "ACTIVE" as const },
            take: 1,
            orderBy: { createdAt: "desc" as const },
            select: { classTerm: { select: { class: { select: { name: true } } } } },
          },
        },
      },
      term: { select: { name: true } },
      feeSchedule: { select: { name: true } },
      category: { select: { name: true } },
      // `approvedBy` is a plain column rather than a relation, so the names are resolved in
      // one lookup below instead of a join.
      approvedBy: true,
    }

    // The two tables carry different enums in `type`, so it is matched as a string against
    // whichever table understands it — an exemption's FULL means nothing to a discount.
    const [discounts, exemptions] = await Promise.all([
      prisma.discount.findMany({
        where: {
          ...where,
          ...(filters?.type === "FIXED" || filters?.type === "PERCENTAGE" ? { type: filters.type } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select,
      }),
      prisma.feeExemption.findMany({
        where: {
          ...where,
          ...(filters?.type === "FULL" || filters?.type === "PARTIAL" ? { type: filters.type } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { ...select, value: true },
      }),
    ])

    const approverIds = [...discounts, ...exemptions]
      .map((row) => row.approvedBy)
      .filter((id): id is string => Boolean(id))
    const approvers = approverIds.length
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(approverIds)] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : []
    const approverById = new Map(approvers.map((user) => [user.id, `${user.firstName} ${user.lastName}`]))

    // The two tables carry different enums in `type` — a discount is FIXED or PERCENTAGE,
    // an exemption may also be FULL — so the shared shape takes it as the string it is.
    type Raw = Omit<(typeof discounts)[number], "type" | "value"> & {
      type: string
      value: Prisma.Decimal | null
    }
    const toRow = (row: Raw): FinanceAdjustmentRow => ({
      id: row.id,
      studentId: row.student.id,
      studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
      admissionNo: row.student.admissionNo,
      className: row.student.classTerms[0]?.classTerm.class.name ?? null,
      termName: row.term?.name ?? null,
      feeName: row.feeSchedule?.name ?? "Fee",
      categoryName: row.category?.name ?? null,
      type: row.type,
      value: moneyString(row.value ?? 0),
      amount: moneyString(row.amountApplied),
      reason: row.reason,
      approvedBy: row.approvedBy ? (approverById.get(row.approvedBy) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    })

    return {
      success: true,
      data: {
        discounts: discounts.map((row) => toRow(row)),
        exemptions: exemptions.map((row) => toRow(row)),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load finance adjustments")
  }
}

/** Methods that leave a trail outside the school: their reference is what proves the money. */
const METHODS_NEEDING_REFERENCE = new Set(["BANK_TRANSFER", "POS", "ONLINE", "CHEQUE"])

export async function recordStudentPayment(input: unknown): Promise<ActionResult<{
  id: string
  receiptNo: string
  receipts: Array<{ id: string; receiptNo: string; termName: string | null; amount: string }>
}>> {
  try {
    const actor = await requirePaymentRecorder()
    const schoolId = await actorSchool(actor)
    const data = paymentSchema.parse(input)
    const referenceNo = data.referenceNo?.trim() || null

    // A bank alert, POS slip or cheque can be presented twice. The reference is the only
    // thing that tells the two apart, so it is required and may be receipted once.
    if (METHODS_NEEDING_REFERENCE.has(data.paymentMethod) && !referenceNo) {
      throw new Error("Enter the bank, POS or cheque reference for this payment")
    }

    // One receipt belongs to one term, so term reports stay true. Charges from several
    // terms become one receipt per term, all in the same transaction.
    const charges = await prisma.studentCharge.findMany({
      where: { id: { in: data.allocations.map((allocation) => allocation.chargeId) }, studentId: data.studentId, schoolId },
      select: { id: true, termId: true, term: { select: { name: true, startDate: true } } },
    })
    if (charges.length !== new Set(data.allocations.map((allocation) => allocation.chargeId)).size) {
      throw new Error("One or more selected charges were not found")
    }
    const chargeById = new Map(charges.map((charge) => [charge.id, charge]))
    const groups = new Map<string, { termName: string | null; start: number; allocations: typeof data.allocations }>()
    for (const allocation of data.allocations) {
      const charge = chargeById.get(allocation.chargeId)!
      const termId = charge.termId ?? data.termId
      const group = groups.get(termId) ?? { termName: charge.term?.name ?? null, start: charge.term?.startDate.getTime() ?? 0, allocations: [] }
      group.allocations.push(allocation)
      groups.set(termId, group)
    }
    const ordered = [...groups.entries()].sort((a, b) => a[1].start - b[1].start)

    const receipts = await prisma.$transaction(async (tx) => {
      // Inside the transaction, not before it. Checked before the transaction, the only
      // thing stopping two cashiers who enter the same bank alert at the same moment was
      // that both also bump the school's receipt counter - a side effect, not a rule, and
      // the loser was shown "write conflict or deadlock". Here the check is part of the
      // guarantee itself: under Serializable this read locks what it scanned, so the second
      // writer is rolled back (and told why, below) rather than inserting beside the first.
      // A unique constraint cannot do this job: a payment split across terms is several
      // receipts that rightly share one reference.
      if (referenceNo) {
        const already = await tx.payment.findFirst({
          where: { schoolId, paymentMethod: data.paymentMethod, referenceNo, status: "COMPLETED" },
          select: { receiptNo: true },
        })
        if (already) throw new Error(`Reference ${referenceNo} was already receipted on ${already.receiptNo}`)
      }

      const posted: Array<{ id: string; receiptNo: string; termName: string | null; amount: string }> = []
      for (const [termId, group] of ordered) {
        const payment = await postStudentPaymentInTransaction(tx, {
          schoolId,
          studentId: data.studentId,
          termId,
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          referenceNo,
          receivedBy: actor.userId,
          notes: ordered.length > 1 ? `${data.notes ? `${data.notes} — ` : ""}Part of one payment split by term` : data.notes,
          allocations: group.allocations,
        })
        await queuePaymentReceiptInTransaction(tx, {
          schoolId, studentId: data.studentId, paymentId: payment.id, reference: referenceNo ?? payment.receiptNo,
        })
        posted.push({
          id: payment.id,
          receiptNo: payment.receiptNo,
          termName: group.termName,
          amount: group.allocations.reduce((total, allocation) => total.plus(allocation.amount), money(0)).toFixed(2),
        })
      }
      return posted
    }, { isolationLevel: "Serializable" })

    const allocationTotal = data.allocations.reduce((total, allocation) => total.plus(allocation.amount), money(0))
    await recordAudit({
      actor,
      action: "finance.payment.record",
      entityType: "Payment",
      entityId: receipts[0]!.id,
      summary: `Recorded payment ${receipts.map((receipt) => receipt.receiptNo).join(", ")} for ${allocationTotal.toFixed(2)}`,
      after: {
        studentId: data.studentId,
        amount: allocationTotal.toFixed(2),
        receipts: receipts.map((receipt) => ({ receiptNo: receipt.receiptNo, termName: receipt.termName, amount: receipt.amount })),
      },
    })

    revalidateFinance("/student-payments", `/students/${data.studentId}/statement`)
    return { success: true, data: { id: receipts[0]!.id, receiptNo: receipts[0]!.receiptNo, receipts } }
  } catch (error) {
    // The losing side of two simultaneous postings. Nothing was written; saying so, and
    // why, beats Prisma's "write conflict or a deadlock".
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        success: false,
        error:
          "Another payment was being recorded at the same moment and this one was not saved. " +
          "Refresh the student's statement and check before recording it again.",
      }
    }
    return toError(error, "Failed to record payment")
  }
}

/**
 * Why a receipt cannot be refunded at the counter, or null when it can. Checked when the
 * refund is asked for and again when it is approved, since the receipt can change between.
 */
async function counterRefundProblem(
  db: Prisma.TransactionClient | typeof prisma,
  schoolId: string,
  paymentId: string,
): Promise<string | null> {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, schoolId },
    select: {
      status: true,
      gatewayTransaction: { select: { id: true } },
      unappliedApplications: { select: { id: true }, take: 1 },
    },
  })
  if (!payment) return "Payment not found"
  if (payment.status !== "COMPLETED") {
    return `Only a completed payment can be refunded; this receipt is ${payment.status.toLowerCase()}`
  }
  // Reversing an online receipt here would restore the balance without returning the
  // parent's money. Online payments are refunded through the gateway, which reverses the
  // receipt only once the provider confirms the refund.
  if (payment.gatewayTransaction) {
    return "This receipt was paid online. Refund it from Online Payments so the money is actually returned to the payer."
  }
  // A receipt made by applying held dedicated-account money. Reversing it here reopened the
  // charges while the held record stayed APPLIED, so the transfer was then neither held,
  // applied nor refunded anywhere. Its way back is "Move back to held" on the applied money,
  // which reverses the receipt and holds the money again; returning it takes two people.
  if (payment.unappliedApplications.length > 0) {
    return "This receipt was made from a bank transfer into a dedicated account, so it cannot be " +
      "reversed at the counter. Open Unapplied Money, choose Applied, and use Move back to held " +
      "on this receipt. The money can then be applied again or returned to the payer."
  }
  return null
}

async function lockReceipt(tx: Prisma.TransactionClient, paymentId: string, schoolId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM Payment WHERE id = ${paymentId} AND schoolId = ${schoolId} FOR UPDATE`)
}

/**
 * Asks for a counter receipt to be refunded. Money handed back at the desk is money out, so
 * it takes two people, like every other refund: this records the request, and a different
 * user with refund approval reverses the receipt with `approveStudentPaymentRefund`. Until
 * then the receipt, and the fees it paid, stand.
 */
export async function requestStudentPaymentRefund(input: unknown): Promise<ActionResult<{ requestId: string }>> {
  try {
    const actor = await requirePaymentRecorder()
    const schoolId = await actorSchool(actor)
    const data = refundPaymentSchema.parse(input)

    const request = await prisma.$transaction(async (tx) => {
      await lockReceipt(tx, data.paymentId, schoolId)
      const problem = await counterRefundProblem(tx, schoolId, data.paymentId)
      if (problem) throw new Error(problem)
      const open = await tx.counterRefundRequest.findFirst({ where: { paymentId: data.paymentId, status: "REQUESTED" }, select: { id: true } })
      if (open) throw new Error("A refund of this receipt is already waiting for approval")
      return tx.counterRefundRequest.create({
        data: { schoolId, paymentId: data.paymentId, reason: data.reason, referenceNo: data.referenceNo || null, requestedBy: actor.userId },
        include: { payment: { select: { receiptNo: true, amount: true, studentId: true } } },
      })
    })

    await recordAudit({
      actor,
      action: "finance.payment.refund_request",
      entityType: "Payment",
      entityId: data.paymentId,
      summary: `Asked to refund ${request.payment.receiptNo}: ${moneyString(request.payment.amount)}, waiting for approval — ${data.reason}`,
      after: { requestId: request.id, reason: data.reason, referenceNo: data.referenceNo || null },
    })
    revalidateFinance("/receipts", `/receipts/${data.paymentId}`)
    return { success: true, data: { requestId: request.id } }
  } catch (error) {
    return toError(error, "Failed to request the refund")
  }
}

/**
 * The second person's approval: only now is the receipt reversed and every allocation
 * restored to its charge. The receipt and allocations remain immutable evidence; an
 * append-only reversal explains why their financial effect was undone.
 */
export async function approveStudentPaymentRefund(input: unknown): Promise<ActionResult<{ id: string; status: PaymentStatus }>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    const schoolId = await actorSchool(actor)
    const data = z.object({ requestId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)

    const request = await prisma.$transaction(async (tx) => {
      const found = await tx.counterRefundRequest.findFirst({ where: { id: data.requestId, schoolId }, select: { paymentId: true } })
      if (!found) throw new Error("Refund request not found")
      await lockReceipt(tx, found.paymentId, schoolId)
      const request = await tx.counterRefundRequest.findUniqueOrThrow({
        where: { id: data.requestId },
        include: { payment: { select: { id: true, receiptNo: true, amount: true, studentId: true } } },
      })
      if (request.status !== "REQUESTED") throw new Error(`This refund request was already ${request.status.toLowerCase()}`)
      if (request.requestedBy === actor.userId) throw new Error("A different person must approve a refund you asked for")
      const problem = await counterRefundProblem(tx, schoolId, request.paymentId)
      if (problem) throw new Error(problem)
      const { reverseStudentPaymentInTransaction } = await import("@/lib/finance/payment-ledger.server")
      const outcome = await reverseStudentPaymentInTransaction(tx, {
        schoolId, paymentId: request.paymentId, reason: request.reason, referenceNo: request.referenceNo, createdBy: actor.userId,
      })
      if (outcome !== "reversed") throw new Error("This receipt was already reversed")
      await queueRefundNoticeInTransaction(tx, { schoolId, paymentId: request.paymentId, reason: request.reason })
      await tx.counterRefundRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", decidedBy: actor.userId, decidedAt: new Date() },
      })
      return request
    }, { isolationLevel: "Serializable" })

    await recordAudit({
      actor,
      action: "finance.payment.refund",
      entityType: "Payment",
      entityId: request.paymentId,
      summary: `Refunded ${request.payment.receiptNo}: ${moneyString(request.payment.amount)} — ${request.reason}`,
      before: { status: "COMPLETED" },
      after: { status: "REFUNDED", reason: request.reason, referenceNo: request.referenceNo, requestedBy: request.requestedBy },
    })

    revalidateFinance("/receipts", `/receipts/${request.paymentId}`, `/students/${request.payment.studentId}/statement`, "/debtors")
    return { success: true, data: { id: request.paymentId, status: "REFUNDED" } }
  } catch (error) {
    return toError(error, "Failed to approve the refund")
  }
}

/** Declines a counter refund request; the receipt stands. Any approver, or the requester, may. */
export async function rejectStudentPaymentRefund(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await requirePermission("finance.approve_refunds")
    const schoolId = await actorSchool(actor)
    const data = z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(input)
    const changed = await prisma.counterRefundRequest.updateMany({
      where: { id: data.requestId, schoolId, status: "REQUESTED" },
      data: { status: "REJECTED", decidedBy: actor.userId, decidedAt: new Date(), rejectionReason: data.reason },
    })
    if (changed.count !== 1) throw new Error("This refund request was already decided")
    await recordAudit({ actor, action: "finance.payment.refund_reject", entityType: "CounterRefundRequest", entityId: data.requestId,
      summary: `Declined a counter refund request — ${data.reason}` })
    revalidateFinance("/receipts")
    return { success: true, data: undefined }
  } catch (error) {
    return toError(error, "Failed to decline the refund")
  }
}

/** The requester takes back a request nobody has decided yet. */
export async function withdrawStudentPaymentRefund(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await requirePaymentRecorder()
    const schoolId = await actorSchool(actor)
    const data = z.object({ requestId: z.string().uuid() }).parse(input)
    const changed = await prisma.counterRefundRequest.updateMany({
      where: { id: data.requestId, schoolId, status: "REQUESTED", requestedBy: actor.userId },
      data: { status: "WITHDRAWN", decidedBy: actor.userId, decidedAt: new Date() },
    })
    if (changed.count !== 1) throw new Error("Only your own undecided refund request can be withdrawn")
    await recordAudit({ actor, action: "finance.payment.refund_withdraw", entityType: "CounterRefundRequest", entityId: data.requestId,
      summary: "Withdrew a counter refund request" })
    revalidateFinance("/receipts")
    return { success: true, data: undefined }
  } catch (error) {
    return toError(error, "Failed to withdraw the refund request")
  }
}

/** Counter refunds waiting for a second person, for the approvers' list. */
export async function getPendingStudentPaymentRefunds(): Promise<ActionResult<Array<{
  id: string
  paymentId: string
  receiptNo: string
  amount: string
  studentName: string
  reason: string
  requestedByName: string
  requestedAt: string
}>>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const requests = await prisma.counterRefundRequest.findMany({
      where: { schoolId, status: "REQUESTED" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { payment: { select: { receiptNo: true, amount: true, student: { select: { user: { select: { firstName: true, lastName: true } } } } } } },
    })
    const names = new Map((await prisma.user.findMany({
      where: { id: { in: [...new Set(requests.map((request) => request.requestedBy))] } },
      select: { id: true, firstName: true, lastName: true },
    })).map((user) => [user.id, `${user.firstName} ${user.lastName}`]))
    return {
      success: true,
      data: requests.map((request) => ({
        id: request.id,
        paymentId: request.paymentId,
        receiptNo: request.payment.receiptNo,
        amount: moneyString(request.payment.amount),
        studentName: `${request.payment.student.user.firstName} ${request.payment.student.user.lastName}`,
        reason: request.reason,
        requestedByName: names.get(request.requestedBy) ?? "another user",
        requestedAt: request.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    return toError(error, "Failed to load refund requests")
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

    const scope = {
      schoolId,
      ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(filters?.termId ? { termId: filters.termId } : {}),
      ...(filters?.classTermId ? { classTermId: filters.classTermId } : {}),
    }

    // Who is a debtor is decided by what is still owing. What a debtor's row *says* is then
    // read from every charge in scope, settled ones included — otherwise the Paid column
    // disagrees with the statement the Statement button opens, because a fee paid in full
    // would have dropped out of the set entirely.
    const owing = await prisma.studentCharge.findMany({
      where: { ...scope, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] } },
      select: { studentId: true },
      distinct: ["studentId"],
    })
    if (owing.length === 0) return { success: true, data: [] }

    const charges = await prisma.studentCharge.findMany({
      where: { ...scope, studentId: { in: owing.map((charge) => charge.studentId) } },
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

export async function getClassPaymentSummary(filters?: {
  sessionId?: string | null
  termId?: string | null
  classTermId?: string | null
}): Promise<ActionResult<Array<{
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
        ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(filters?.termId ? { termId: filters.termId } : {}),
        ...(filters?.classTermId ? { classTermId: filters.classTermId } : {}),
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

export async function getAccumulatedFundReport(filters?: {
  sessionId?: string | null
  termId?: string | null
}): Promise<ActionResult<{
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
        ...(filters?.termId ? { termId: filters.termId } : {}),
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

export type { ReceiptDocument }

export async function getReceipt(paymentId: string): Promise<ActionResult<ReceiptDocument>> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    return loadReceipt(paymentId, schoolId)
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
/**
 * Which accountants belong to this school.
 *
 * Two things attach one: the `Admin` row that `createFinanceOfficer` writes, and a
 * school-scoped permission profile, which is how the seed and the permissions screen attach
 * one. Matching only the first is why the school's own bursar — the name on every receipt —
 * did not appear on this screen at all, and so could not be managed or revoked.
 */
function financeOfficerScope(schoolId: string) {
  return {
    role: "ACCOUNTANT" as const,
    OR: [
      { admin: { schoolId } },
      { permissionProfiles: { some: { schoolId, isActive: true } } },
    ],
  }
}

export type FinanceOfficerRow = {
  userId: string
  name: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  /** Receipts issued, and what they add up to — the work the account has actually done. */
  paymentsRecorded: number
  totalCollected: string
  lastPaymentDate: string | null
  /** Discounts and exemptions this officer approved. */
  adjustmentsApproved: number
}

/**
 * The accountants assigned to this school, with what each has handled.
 *
 * The counts are the point: an officer's name is on every receipt they issue, so the list
 * has to say who is actually taking money before anybody's access is changed — and the
 * delete rule is decided on exactly these numbers.
 */
export async function getFinanceOfficers(): Promise<ActionResult<FinanceOfficerRow[]>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)

    const users = await prisma.user.findMany({
      where: financeOfficerScope(schoolId),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
        credentials: { where: { type: "EMAIL" }, select: { value: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    })
    const officers = users.map((user) => ({ user }))

    const userIds = officers.map(({ user }) => user.id)
    const [payments, discounts, exemptions] = userIds.length
      ? await Promise.all([
          prisma.payment.groupBy({
            by: ["receivedBy"],
            where: { schoolId, receivedBy: { in: userIds }, status: "COMPLETED", unappliedApplications: { none: {} } },
            _count: { _all: true },
            _sum: { amount: true },
            _max: { paymentDate: true },
          }),
          prisma.discount.groupBy({
            by: ["approvedBy"],
            where: { schoolId, approvedBy: { in: userIds } },
            _count: { _all: true },
          }),
          prisma.feeExemption.groupBy({
            by: ["approvedBy"],
            where: { schoolId, approvedBy: { in: userIds } },
            _count: { _all: true },
          }),
        ])
      : [[], [], []]

    const paymentsBy = new Map(payments.map((row) => [row.receivedBy, row]))
    const approvalsBy = new Map<string, number>()
    for (const row of [...discounts, ...exemptions]) {
      if (!row.approvedBy) continue
      approvalsBy.set(row.approvedBy, (approvalsBy.get(row.approvedBy) ?? 0) + row._count._all)
    }

    return {
      success: true,
      data: officers.map(({ user }) => {
        const activity = paymentsBy.get(user.id)

        return {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.credentials[0]?.value ?? null,
          phone: user.phone,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          paymentsRecorded: activity?._count._all ?? 0,
          totalCollected: moneyString(activity?._sum.amount ?? 0),
          lastPaymentDate: activity?._max.paymentDate?.toISOString() ?? null,
          adjustmentsApproved: approvalsBy.get(user.id) ?? 0,
        }
      }),
    }
  } catch (error) {
    return toError(error, "Failed to load finance staff")
  }
}

/** One officer, with every email already taken so a rename can be checked as it is typed. */
export async function getFinanceOfficer(userId: string): Promise<
  ActionResult<FinanceOfficerRow & {
    firstName: string
    lastName: string
    takenEmails: Array<{ userId: string; email: string }>
    /** Expenditure and payroll records naming them - see canDeleteFinanceOfficer. */
    spendingHandled: number
  }>
> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)

    const officers = await getFinanceOfficers()
    if (!officers.success) throw new Error(officers.error)

    const row = officers.data.find((officer) => officer.userId === userId)
    if (!row) throw new Error("Finance staff not found")

    const [user, credentials, expenses, payrollRuns, salaryPayments] = await Promise.all([
      prisma.user.findFirst({
        where: { id: userId, ...financeOfficerScope(schoolId) },
        select: { firstName: true, lastName: true },
      }),
      prisma.credential.findMany({ where: { type: "EMAIL" }, select: { userId: true, value: true } }),
      prisma.expense.count({
        where: { schoolId, OR: [{ recordedBy: userId }, { approvedBy: userId }, { paidBy: userId }] },
      }),
      prisma.payrollRun.count({
        where: { schoolId, OR: [{ generatedBy: userId }, { approvedBy: userId }, { paidBy: userId }] },
      }),
      prisma.salaryPayment.count({ where: { schoolId, paidBy: userId } }),
    ])
    if (!user) throw new Error("Finance staff not found")

    return {
      success: true,
      data: {
        ...row,
        firstName: user.firstName,
        lastName: user.lastName,
        takenEmails: credentials.map((credential) => ({ userId: credential.userId, email: credential.value })),
        spendingHandled: expenses + payrollRuns + salaryPayments,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the finance officer")
  }
}

/**
 * Renames an officer, or moves their sign-in address.
 *
 * The email is the account: changing it changes what they sign in with, so it is checked
 * against every credential on the platform rather than only this school's.
 */
export async function updateFinanceOfficer(input: unknown): Promise<ActionResult<{ userId: string }>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const data = z
      .object({
        userId: z.string().min(1),
        firstName: z.string().trim().min(1, "First name is required"),
        lastName: z.string().trim().min(1, "Last name is required"),
        email: z.string().trim().toLowerCase(),
        phone: z.string().trim().optional().nullable(),
      })
      .parse(input)

    const officer = await prisma.user.findFirst({
      where: { id: data.userId, ...financeOfficerScope(schoolId) },
      select: { id: true, credentials: { where: { type: "EMAIL" }, select: { id: true, value: true } } },
    })
    if (!officer) throw new Error("Finance staff not found")

    const taken = await prisma.credential.findMany({
      where: { type: "EMAIL" },
      select: { userId: true, value: true },
    })
    const verdict = canUseOfficerEmail(
      data.email,
      taken.map((credential) => ({ userId: credential.userId, email: credential.value })),
      data.userId,
    )
    if (!verdict.allowed) throw new Error(verdict.reason)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.userId },
        data: { firstName: data.firstName, lastName: data.lastName, phone: data.phone || null },
      })

      const credential = officer.credentials[0]
      if (credential && credential.value !== data.email) {
        await tx.credential.update({ where: { id: credential.id }, data: { value: data.email } })
      }
    })

    revalidateFinance("/staff")
    return { success: true, data: { userId: data.userId } }
  } catch (error) {
    return toError(error, "Failed to update finance staff")
  }
}

/**
 * Issues a fresh sign-in password, shown once.
 *
 * Passwords are stored hashed, so a forgotten one cannot be looked up — it can only be
 * replaced. The new one matches what a newly created account gets, and the officer is
 * expected to change it at first sign-in.
 */
export async function resetFinanceOfficerPassword(input: unknown): Promise<
  ActionResult<{ userId: string; defaultPassword: string }>
> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const { userId } = z.object({ userId: z.string().min(1) }).parse(input)

    const officer = await prisma.user.findFirst({
      where: { id: userId, ...financeOfficerScope(schoolId) },
      select: { credentials: { where: { type: "EMAIL" }, select: { id: true } } },
    })
    if (!officer) throw new Error("Finance staff not found")

    const credential = officer.credentials[0]
    if (!credential) throw new Error("That account has no email credential to reset")

    const defaultPassword = generateTemporaryPassword()
    await prisma.credential.update({
      where: { id: credential.id },
      data: { passwordHash: await bcrypt.hash(defaultPassword, 10) },
    })
    await revokeAllSessionsForUser(userId)

    await recordAudit({
      actor,
      action: "finance_officer.reset_password",
      entityType: "User",
      entityId: userId,
      summary: "Issued a new sign-in password for a finance officer",
    })

    revalidateFinance("/staff")
    return { success: true, data: { userId, defaultPassword } }
  } catch (error) {
    return toError(error, "Failed to reset the password")
  }
}

/** Removes an account that has never been used. Anything else is refused with the reason. */
export async function deleteFinanceOfficer(input: unknown): Promise<ActionResult<{
  userId: string
  /** True when HR had already worked on their staff file, which is therefore kept, unlinked. */
  hrRecordKept: boolean
}>> {
  try {
    const actor = await requireFinanceManager()
    const schoolId = await actorSchool(actor)
    const { userId } = z.object({ userId: z.string().min(1) }).parse(input)

    const officer = await prisma.user.findFirst({
      where: { id: userId, ...financeOfficerScope(schoolId) },
      select: { id: true },
    })
    if (!officer) throw new Error("Finance staff not found")

    const namedBy = { OR: [{ recordedBy: userId }, { approvedBy: userId }, { paidBy: userId }] }
    const [paymentsRecorded, discounts, exemptions, expenses, payrollRuns, salaryPayments, staff] =
      await Promise.all([
        prisma.payment.count({ where: { schoolId, receivedBy: userId } }),
        prisma.discount.count({ where: { schoolId, approvedBy: userId } }),
        prisma.feeExemption.count({ where: { schoolId, approvedBy: userId } }),
        prisma.expense.count({ where: { schoolId, ...namedBy } }),
        prisma.payrollRun.count({
          where: { schoolId, OR: [{ generatedBy: userId }, { approvedBy: userId }, { paidBy: userId }] },
        }),
        prisma.salaryPayment.count({ where: { schoolId, paidBy: userId } }),
        prisma.staff.findUnique({
          where: { userId },
          select: {
            id: true,
            autoProvisioned: true,
            onboardingStatus: true,
            _count: {
              select: {
                salaries: true,
                allowances: true,
                deductions: true,
                payrollItems: true,
                documents: true,
                discipline: true,
                expenses: true,
              },
            },
          },
        }),
      ])

    const verdict = canDeleteFinanceOfficer({
      paymentsRecorded,
      adjustmentsApproved: discounts + exemptions,
      spendingHandled: expenses + payrollRuns + salaryPayments,
    })
    if (!verdict.allowed) throw new Error(verdict.reason)

    // The HR record opened automatically with this login goes with it, when HR has not
    // touched it: it exists only because the login did, and left behind it would sit in
    // the staff directory as an employee nobody hired. Once HR has worked on the file it is
    // kept - Staff.userId is SET NULL - because whether they still work here is HR's
    // question, not a login's.
    const untouchedHrRecord =
      staff !== null &&
      staff.autoProvisioned &&
      staff.onboardingStatus === "NOT_STARTED" &&
      Object.values(staff._count).every((count) => count === 0)

    // The user is the account: the admin row and the credentials cascade from it.
    await prisma.$transaction(async (tx) => {
      if (untouchedHrRecord) await tx.staff.delete({ where: { id: staff.id } })
      await tx.user.delete({ where: { id: userId } })
    })

    const hrRecordKept = staff !== null && !untouchedHrRecord
    await recordAudit({
      actor,
      action: "finance_officer.delete",
      entityType: "User",
      entityId: userId,
      summary:
        "Deleted an unused finance officer login" +
        (untouchedHrRecord ? " and its untouched HR record" : "") +
        (hrRecordKept ? "; their HR record was kept" : ""),
    })

    revalidateFinance("/staff")
    revalidatePath("/dashboard/admin/hr/staff")
    return { success: true, data: { userId, hrRecordKept } }
  } catch (error) {
    return toError(error, "Failed to delete finance staff")
  }
}

export async function createFinanceOfficer(input: unknown): Promise<ActionResult<{
  userId: string
  defaultPassword: string
  /** The HR record they were put on, or null if HR provisioning could not run. */
  staffNo: string | null
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

    const defaultPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)

    const { user, staffNo } = await prisma.$transaction(async (tx) => {
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

      // Employment is HR's. A finance officer is staff with a payslip, and this used to
      // create the login and stop, so HR and payroll never heard of them. Same helper, and
      // the same never-throws rule, as a new teacher: HR not being set up must not cost the
      // school its accountant.
      const provisioned = await provisionStaffForLogin(tx, {
        schoolId,
        userId: created.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        email: data.email,
        department: "Finance",
        staffType: "ACCOUNTANT",
      })

      return { user: created, staffNo: provisionedStaffNo(provisioned) }
    })

    await recordAudit({
      actor,
      action: "finance_officer.create",
      entityType: "User",
      entityId: user.id,
      summary:
        `Created finance officer ${data.firstName} ${data.lastName} (${data.email})` +
        (staffNo ? `, HR record ${staffNo}` : ", HR record not created"),
    })

    revalidateFinance("/staff")
    revalidatePath("/dashboard/admin/hr/onboarding")
    return { success: true, data: { userId: user.id, defaultPassword, staffNo } }
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
    if (data.isActive) {
      const blocked = await loginBlockedByEmployment(prisma, data.userId)
      if (blocked) throw new Error(blocked)
    }

    await prisma.user.update({
      where: { id: data.userId },
      data: { isActive: data.isActive },
    })
    if (!data.isActive) await revokeAllSessionsForUser(data.userId)

    await recordAudit({
      actor,
      action: data.isActive ? "finance_officer.restore" : "finance_officer.revoke",
      entityType: "User",
      entityId: data.userId,
      summary: data.isActive ? "Restored a finance officer's access" : "Revoked a finance officer's access",
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
export type ReceiptRegisterRow = {
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
}

/**
 * The receipt register, narrowed by whatever the filter bar has set.
 *
 * The totals are aggregated rather than added up from `rows`: the row list is capped, so on
 * a school with a full year behind it a summed-in-the-page total would quietly report the
 * most recent 500 receipts as though they were all of them. `totalCount` and `totalAmount`
 * describe everything the filter matches, capped or not, and `completedAmount` separates
 * money actually banked from payments still awaiting confirmation.
 */
export async function getReceiptRegister(filters?: {
  termId?: string | null
  sessionId?: string | null
  method?: string | null
  status?: string | null
  cashierId?: string | null
  /** `yyyy-mm-dd`, inclusive. */
  from?: string | null
  /** `yyyy-mm-dd`, inclusive. */
  to?: string | null
  search?: string | null
}): Promise<
  ActionResult<{
    rows: ReceiptRegisterRow[]
    totalCount: number
    totalAmount: string
    completedAmount: string
    /** Receipts later reversed: issued, but the money is no longer the school's. */
    refundedAmount: string
    capped: boolean
    cashiers: Array<{ id: string; name: string }>
  }>
> {
  try {
    const actor = await requireFinanceViewer()
    const schoolId = await actorSchool(actor)
    const search = filters?.search?.trim()

    // A day filter covers that whole day. `from` is its first instant and `to` its last, in
    // the school's own time — a receipt issued at four in the afternoon belongs to the day
    // the cashier would name, not to the UTC day it happens to fall in.
    const dayStart = (value: string) => {
      const [year, month, day] = value.split("-").map(Number)
      return new Date(year, month - 1, day, 0, 0, 0, 0)
    }
    const dayEnd = (value: string) => {
      const [year, month, day] = value.split("-").map(Number)
      return new Date(year, month - 1, day, 23, 59, 59, 999)
    }

    const where: Prisma.PaymentWhereInput = {
      schoolId,
      ...(filters?.termId ? { termId: filters.termId } : {}),
      // Through the term rather than `payment.sessionId`, which is nullable and was not
      // always written; the term a payment belongs to always knows its session.
      ...(filters?.sessionId && !filters?.termId ? { term: { sessionId: filters.sessionId } } : {}),
      // `in` over the spellings rather than a bare equals: see `paymentMethodVariants`.
      ...(filters?.method ? { paymentMethod: { in: paymentMethodVariants(filters.method) } } : {}),
      ...(filters?.status ? { status: filters.status as PaymentStatus } : {}),
      ...(filters?.cashierId ? { receivedBy: filters.cashierId } : {}),
      ...(filters?.from || filters?.to
        ? {
            paymentDate: {
              ...(filters.from ? { gte: dayStart(filters.from) } : {}),
              ...(filters.to ? { lte: dayEnd(filters.to) } : {}),
            },
          }
        : {}),
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
    }

    const [payments, totals, completed, refunded, cashiers] = await Promise.all([
      prisma.payment.findMany({
        where,
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
      }),
      prisma.payment.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
      // `AND` rather than a spread: spreading would *replace* a status the user picked, so
      // filtering to "awaiting confirmation" reported every completed receipt in the school
      // as the confirmed part of eight pending ones, and the difference came out negative.
      prisma.payment.aggregate({ where: { AND: [where, { status: "COMPLETED" }] }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { AND: [where, { status: "REFUNDED" }] }, _sum: { amount: true } }),
      // Every cashier the school has, not only those matching the filter — a select that
      // empties itself once you use it cannot be used to change your mind.
      prisma.payment.findMany({
        where: { schoolId, receivedBy: { not: null } },
        distinct: ["receivedBy"],
        select: { receivedByUser: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ])

    return {
      success: true,
      data: {
        rows: payments.map((payment) => ({
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
        totalCount: totals._count._all,
        totalAmount: moneyString(totals._sum.amount),
        completedAmount: moneyString(completed._sum.amount),
        refundedAmount: moneyString(refunded._sum.amount),
        capped: payments.length === 500 && totals._count._all > 500,
        cashiers: cashiers
          .map((entry) => entry.receivedByUser)
          .filter((user): user is NonNullable<typeof user> => Boolean(user))
          .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}` }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the receipt register")
  }
}
