"use server"

import { prisma } from "@/lib/db"
import { requireActor } from "@/lib/authz"
import { PUBLISHED_ONLY, averageScore, subjectTotal } from "@/lib/results-visibility"
import {
  buildAcademicHistory,
  type AcademicHistory,
} from "@/lib/results/academic-history.server"
import {
  buildSessionReportForStudent,
  sessionScoreHeaders,
  type SessionReportForStudent,
} from "@/lib/results/session-report.server"
import { buildTermReportForStudent } from "@/lib/results/term-report.server"
import { gradeScoreForSchool } from "@/lib/grading.server"
import { Prisma } from "@prisma/client"

/**
 * What a student may see of their own record.
 *
 * The parent portal has to prove a link between the signed-in parent and the child they
 * asked for, because the student id arrives from the URL. Nothing here takes an id at
 * all: every query starts from the student row belonging to the signed-in user, so a
 * student can only ever be asking about themselves.
 *
 * Results are filtered by `PUBLISHED_ONLY`, for the same reason they are on the parent
 * side — a teacher entering a score is not the school releasing it. Students hit this
 * harder than parents do: they know the exact day marks are being typed.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type StudentOverview = {
  student: { id: string; name: string; admissionNo: string; avatarUrl: string | null }
  school: { name: string; code: string }
  enrolment: { className: string; termName: string; sessionName: string } | null
  subjects: Array<{ name: string; code: string }>
  results: {
    termName: string | null
    released: boolean
    average: number | null
    subjects: Array<{
      subject: string
      ca: number | null
      exam: number | null
      total: number | null
      grade: string | null
    }>
  }
  attendance: {
    rate: number | null
    present: number
    total: number
    recent: Array<{ id: string; date: string; status: string }>
  }
  fees: {
    billed: string
    paid: string
    balance: string
    charges: Array<{ id: string; name: string; due: string; paid: string; balance: string; status: string }>
    payments: Array<{
      id: string
      receiptNo: string
      amount: string
      paidOn: string
      method: string
      status: string
      termName: string
    }>
  }
}

const naira = (value: Prisma.Decimal.Value) => {
  const [whole, fraction] = new Prisma.Decimal(value).toFixed(2).split(".")
  return `₦${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`
}

/**
 * The signed-in student's term at a glance: where they are, what they offer, what has
 * been released of their marks, how their attendance stands, and what the school has
 * billed and received against their name.
 */
export async function getMyOverview(): Promise<ActionResult<StudentOverview>> {
  try {
    const actor = await requireActor()

    const student = await prisma.student.findUnique({
      where: { userId: actor.userId },
      select: {
        id: true,
        admissionNo: true,
        schoolId: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        school: { select: { name: true, code: true } },
      },
    })
    if (!student) throw new Error("No student record for this account")

    const [enrolment, assessments, attendances, charges, payments] = await Promise.all([
      prisma.studentClassTerm.findFirst({
        where: { studentId: student.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: {
          classTerm: {
            select: {
              class: { select: { name: true } },
              term: { select: { name: true, session: { select: { name: true } } } },
              classSubjects: { select: { subject: { select: { name: true, code: true } } } },
            },
          },
        },
      }),
      prisma.assessment.findMany({
        where: { studentId: student.id, ...PUBLISHED_ONLY, term: { isCurrent: true } },
        select: {
          ca1: true,
          ca2: true,
          ca3: true,
          exam: true,
          subject: { select: { name: true } },
          term: { select: { name: true } },
        },
        orderBy: { subject: { name: "asc" } },
      }),
      prisma.attendance.findMany({
        where: { studentId: student.id },
        orderBy: { date: "desc" },
        take: 30,
        select: { id: true, date: true, status: true },
      }),
      prisma.studentCharge.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          finalAmountDue: true,
          amountPaid: true,
          balance: true,
          status: true,
          feeSchedule: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { studentId: student.id },
        orderBy: { paymentDate: "desc" },
        select: {
          id: true,
          receiptNo: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          status: true,
          term: { select: { name: true } },
        },
      }),
    ])

    // Grades come from the school's own grading system rather than a hardcoded band, so
    // what a student reads here matches what their report card prints.
    const subjectRows = await Promise.all(
      assessments.map(async (assessment) => {
        const total = subjectTotal(assessment)
        const ca = [assessment.ca1, assessment.ca2, assessment.ca3].every((part) => part === null)
          ? null
          : (assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0)

        return {
          subject: assessment.subject.name,
          ca,
          exam: assessment.exam,
          total,
          grade: total === null ? null : (await gradeScoreForSchool(total, student.schoolId)).grade,
        }
      }),
    )

    const present = attendances.filter((entry) => entry.status === "PRESENT").length
    const billed = charges.reduce((sum, charge) => sum.plus(charge.finalAmountDue), new Prisma.Decimal(0))
    const paid = charges.reduce((sum, charge) => sum.plus(charge.amountPaid), new Prisma.Decimal(0))
    const balance = charges.reduce((sum, charge) => sum.plus(charge.balance), new Prisma.Decimal(0))

    return {
      success: true,
      data: {
        student: {
          id: student.id,
          name: `${student.user.firstName} ${student.user.lastName}`,
          admissionNo: student.admissionNo,
          avatarUrl: student.user.avatarUrl,
        },
        school: student.school,
        enrolment: enrolment
          ? {
              className: enrolment.classTerm.class.name,
              termName: enrolment.classTerm.term.name,
              sessionName: enrolment.classTerm.term.session.name,
            }
          : null,
        subjects: enrolment
          ? enrolment.classTerm.classSubjects.map((classSubject) => classSubject.subject)
          : [],
        results: {
          termName: assessments[0]?.term.name ?? enrolment?.classTerm.term.name ?? null,
          // No published rows is not the same as no marks: it means the school has not
          // released this term yet, and the page says so rather than showing an empty table.
          released: assessments.length > 0,
          average: averageScore(assessments),
          subjects: subjectRows,
        },
        attendance: {
          // Null, not 0%: a student with nothing marked has not been absent, and a bare
          // 0% on their own dashboard reads as a disciplinary record they never earned.
          rate: attendances.length > 0 ? Math.round((present / attendances.length) * 100) : null,
          present,
          total: attendances.length,
          recent: attendances.slice(0, 8).map((entry) => ({
            id: entry.id,
            date: entry.date.toISOString().slice(0, 10),
            status: entry.status,
          })),
        },
        fees: {
          billed: naira(billed),
          paid: naira(paid),
          balance: naira(balance),
          charges: charges.map((charge) => ({
            id: charge.id,
            name: charge.feeSchedule?.name ?? "Fee",
            due: naira(charge.finalAmountDue),
            paid: naira(charge.amountPaid),
            balance: naira(charge.balance),
            status: charge.status,
          })),
          payments: payments.map((payment) => ({
            id: payment.id,
            receiptNo: payment.receiptNo,
            amount: naira(payment.amount),
            paidOn: payment.paymentDate.toISOString().slice(0, 10),
            method: payment.paymentMethod,
            status: payment.status,
            termName: payment.term.name,
          })),
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load your record",
    }
  }
}

/**
 * The signed-in student's whole record: every session, every term, and each session's
 * cumulative summary.
 *
 * Takes no id. There is nothing to tamper with, because the only student this can answer
 * for is the one whose user row is signed in.
 */
export async function getMyAcademicHistory(): Promise<ActionResult<AcademicHistory>> {
  try {
    const actor = await requireActor()

    const student = await prisma.student.findUnique({
      where: { userId: actor.userId },
      select: { id: true, schoolId: true },
    })
    if (!student) throw new Error("No student record for this account")

    return { success: true, data: await buildAcademicHistory(student.id, student.schoolId) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load your academic history",
    }
  }
}

/** The signed-in student's sessional report card data. Same gate as the parent path. */
export async function getMySessionReport(
  sessionId: string,
): Promise<ActionResult<SessionReportForStudent & { scoreHeaders: [string, string, string, string, string] }>> {
  try {
    const actor = await requireActor()

    const student = await prisma.student.findUnique({
      where: { userId: actor.userId },
      select: { id: true, schoolId: true },
    })
    if (!student) throw new Error("No student record for this account")

    const history = await buildAcademicHistory(student.id, student.schoolId)
    const session = history.sessions.find((row) => row.sessionId === sessionId)
    if (!session) throw new Error("No record for that session")
    if (session.summary && !session.summary.access.allowed) {
      throw new Error(session.summary.access.reason)
    }

    const data = await buildSessionReportForStudent(student.id, sessionId, student.schoolId)
    if (!data) throw new Error("That session has no report card")

    return { success: true, data: { ...data, scoreHeaders: sessionScoreHeaders(data.report.terms) } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load your sessional report",
    }
  }
}

/** The signed-in student's termly report card, in the school's own format. */
export async function getMyTermReport(
  termId: string,
): Promise<ActionResult<SessionReportForStudent & { scoreHeaders: null }>> {
  try {
    const actor = await requireActor()

    const student = await prisma.student.findUnique({
      where: { userId: actor.userId },
      select: { id: true, schoolId: true },
    })
    if (!student) throw new Error("No student record for this account")

    const history = await buildAcademicHistory(student.id, student.schoolId)
    const term = history.sessions.flatMap((session) => session.terms).find((row) => row.termId === termId)
    if (!term) throw new Error("No record for that term")
    if (!term.access.allowed) throw new Error(term.access.reason)

    const data = await buildTermReportForStudent(student.id, termId, student.schoolId)
    if (!data) throw new Error("That term has no report card")

    return { success: true, data: { ...data, scoreHeaders: null } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load your report card",
    }
  }
}
