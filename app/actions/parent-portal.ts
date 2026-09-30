"use server"

import { prisma } from "@/lib/db"
import { termResultsWithheldReason } from "@/lib/results/withholding.server"
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
 * What a parent may see of their own child.
 *
 * Every query here starts from the link between this parent and this student, so a
 * parent who guesses another child's id gets "not found" rather than a page. That check
 * lives in `childOfSignedInParent` and nothing in this file queries around it.
 *
 * Results are filtered by `PUBLISHED_ONLY`. Releasing marks is a decision the school
 * makes — a teacher entering a score is not a release, and a family seeing a mark
 * mid-entry, before moderation, is how a school ends up explaining a number it never
 * meant to send home.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/** The student, if this parent is linked to them. Throws otherwise. */
async function childOfSignedInParent(studentId: string) {
  const actor = await requireActor()

  const parent = await prisma.parent.findUnique({
    where: { userId: actor.userId },
    select: { id: true, schoolId: true },
  })
  if (!parent) throw new Error("No parent record for this account")

  const link = await prisma.studentParent.findFirst({
    where: { parentId: parent.id, studentId },
    select: {
      relationship: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          schoolId: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          school: { select: { id: true, name: true, code: true } },
        },
      },
    },
  })
  if (!link) throw new Error("That student is not linked to your account")

  return { actor, parent, student: link.student, relationship: link.relationship }
}

export type ChildOverview = {
  student: { id: string; name: string; admissionNo: string; avatarUrl: string | null }
  relationship: string
  enrolment: { className: string; termName: string; sessionName: string } | null
  subjects: Array<{ name: string; code: string }>
  results: {
    termName: string | null
    released: boolean
    /** Set when the school holds this term's results until its fees are paid. */
    withheldReason: string | null
    average: number | null
    subjects: Array<{
      subject: string
      ca: number | null
      exam: number | null
      total: number | null
      grade: string | null
    }>
  }
  fees: {
    billed: string
    paid: string
    balance: string
    onlinePaymentAvailable: boolean
    allowPartialPayments: boolean
    charges: Array<{ id: string; termId: string | null; name: string; due: string; paid: string; balance: string; balanceKobo: number; status: string }>
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
 * One child's term at a glance: where they are, what they offer, what has been
 * released of their marks, and what the school has billed and received.
 */
export async function getChildOverview(studentId: string): Promise<ActionResult<ChildOverview>> {
  try {
    const { student, relationship } = await childOfSignedInParent(studentId)

    const gatewayEnvironment = process.env.PAYMENT_CHECKOUT_ENV?.toUpperCase() === "LIVE"
      || (process.env.PAYMENT_CHECKOUT_ENV === undefined && process.env.NODE_ENV === "production")
      ? "LIVE" : "TEST"
    const [enrolment, assessments, charges, payments, paymentConfiguration] = await Promise.all([
      prisma.studentClassTerm.findFirst({
        where: { studentId, status: "ACTIVE" },
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
        where: { studentId, ...PUBLISHED_ONLY, term: { isCurrent: true } },
        select: {
          ca1: true,
          ca2: true,
          ca3: true,
          exam: true,
          termId: true,
          subject: { select: { name: true } },
          term: { select: { name: true, session: { select: { name: true } } } },
        },
        orderBy: { subject: { name: "asc" } },
      }),
      prisma.studentCharge.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          termId: true,
          finalAmountDue: true,
          amountPaid: true,
          balance: true,
          status: true,
          feeSchedule: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { studentId },
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
      prisma.schoolPaymentConfiguration.findUnique({
        where: {
          schoolId_provider_environment: {
            schoolId: student.schoolId,
            provider: "PAYSTACK",
            environment: gatewayEnvironment,
          },
        },
        select: { isEnabled: true, status: true, allowPartialPayments: true },
      }),
    ])

    const releasedTerm = assessments[0]
    const withheldReason = releasedTerm
      ? await termResultsWithheldReason(student.schoolId, releasedTerm.termId, charges,
          `${releasedTerm.term.name}, ${releasedTerm.term.session.name}`)
      : null

    // Grades come from the school's own grading system, not a hardcoded band, so what a
    // parent reads matches what the report card prints.
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
        relationship,
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
          withheldReason,
          average: withheldReason ? null : averageScore(assessments),
          subjects: withheldReason ? [] : subjectRows,
        },
        fees: {
          billed: naira(billed),
          paid: naira(paid),
          balance: naira(balance),
          onlinePaymentAvailable: paymentConfiguration?.isEnabled === true && paymentConfiguration.status === "READY",
          allowPartialPayments: paymentConfiguration?.allowPartialPayments === true,
          charges: charges.map((charge) => ({
            id: charge.id,
            termId: charge.termId,
            name: charge.feeSchedule?.name ?? "Fee",
            due: naira(charge.finalAmountDue),
            paid: naira(charge.amountPaid),
            balance: naira(charge.balance),
            balanceKobo: charge.balance.mul(100).toNumber(),
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
      error: error instanceof Error ? error.message : "Could not load this child",
    }
  }
}

/** Every child linked to the signed-in parent, for the My Children list. */
export async function getMyChildren(): Promise<ActionResult<Array<{
  id: string
  name: string
  admissionNo: string
  className: string | null
  termName: string | null
  balance: string
}>>> {
  try {
    const actor = await requireActor()

    const parent = await prisma.parent.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    })
    if (!parent) throw new Error("No parent record for this account")

    const links = await prisma.studentParent.findMany({
      where: { parentId: parent.id },
      select: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            classTerms: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                classTerm: {
                  select: {
                    class: { select: { name: true } },
                    term: { select: { name: true } },
                  },
                },
              },
            },
            charges: { select: { balance: true } },
          },
        },
      },
    })

    return {
      success: true,
      data: links.map(({ student }) => ({
        id: student.id,
        name: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
        className: student.classTerms[0]?.classTerm.class.name ?? null,
        termName: student.classTerms[0]?.classTerm.term.name ?? null,
        balance: naira(
          student.charges.reduce((sum, charge) => sum.plus(charge.balance), new Prisma.Decimal(0)),
        ),
      })),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load your children",
    }
  }
}

/**
 * One child's whole record: every session, every term, each session's cumulative summary,
 * and the class movements between them.
 *
 * Authorization is `childOfSignedInParent`, the same guard the overview uses, so a parent
 * can no more reach another family's history than they can their current term.
 */
export async function getChildAcademicHistory(
  studentId: string,
): Promise<ActionResult<AcademicHistory & { studentName: string; admissionNo: string }>> {
  try {
    const { student } = await childOfSignedInParent(studentId)
    const history = await buildAcademicHistory(student.id, student.schoolId)

    return {
      success: true,
      data: {
        ...history,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load this child's history",
    }
  }
}

/**
 * A linked child's sessional report card data, for the same PDF the school prints termly.
 *
 * Gated by the session summary rule, not the per-term one: a sessional card is a statement
 * about the whole year, so it is withheld while any term in it is.
 */
export async function getChildSessionReport(
  studentId: string,
  sessionId: string,
): Promise<ActionResult<SessionReportForStudent & { scoreHeaders: [string, string, string, string, string] }>> {
  try {
    const { student } = await childOfSignedInParent(studentId)

    const history = await buildAcademicHistory(student.id, student.schoolId)
    const session = history.sessions.find((row) => row.sessionId === sessionId)
    if (!session) throw new Error("No record for that session")
    if (session.summary && !session.summary.access.allowed) {
      throw new Error(session.summary.access.reason)
    }

    const data = await buildSessionReportForStudent(student.id, sessionId, student.schoolId)
    if (!data) throw new Error("That session has no report card for this child")

    return { success: true, data: { ...data, scoreHeaders: sessionScoreHeaders(data.report.terms) } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load the sessional report",
    }
  }
}

/**
 * A linked child's termly report card, in the school's own format.
 *
 * Gated per term, not per session: a term that has been paid for is readable even when a
 * later one has not.
 */
export async function getChildTermReport(
  studentId: string,
  termId: string,
): Promise<ActionResult<SessionReportForStudent & { scoreHeaders: null }>> {
  try {
    const { student } = await childOfSignedInParent(studentId)

    const history = await buildAcademicHistory(student.id, student.schoolId)
    const term = history.sessions.flatMap((session) => session.terms).find((row) => row.termId === termId)
    if (!term) throw new Error("No record for that term")
    if (!term.access.allowed) throw new Error(term.access.reason)

    const data = await buildTermReportForStudent(student.id, termId, student.schoolId)
    if (!data) throw new Error("That term has no report card for this child")

    // Null headers means the generator keeps its own termly labels, which is the whole
    // point: this is the school's standard card, not a variant of it.
    return { success: true, data: { ...data, scoreHeaders: null } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load the report card",
    }
  }
}
