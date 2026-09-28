import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export type IntegrityIssue = {
  code: string
  severity: "ERROR" | "WARNING"
  entityType: string
  entityId: string | null
  message: string
}

const decimal = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0)

/** Runs read-only reconciliations and persists the report as one immutable check result. */
export async function runIntegrityChecks(schoolId: string, runBy: string) {
  const check = await prisma.dataIntegrityCheck.create({
    data: {
      schoolId,
      checkType: "FULL_RECONCILIATION",
      description: "Academic, enrollment, results, finance, expenditure and payroll reconciliation",
      status: "RUNNING",
      runBy,
    },
    select: { id: true },
  })

  try {
    const [sessions, terms, pointer, payments, charges, expenses, payrollRuns, workflows, enrollments] =
      await Promise.all([
        prisma.session.findMany({ where: { schoolId, isCurrent: true }, select: { id: true } }),
        prisma.term.findMany({
          where: { session: { schoolId }, isCurrent: true },
          select: { id: true, sessionId: true },
        }),
        prisma.schoolAcademicPeriod.findUnique({ where: { schoolId } }),
        prisma.payment.findMany({
          where: { schoolId, status: { in: ["COMPLETED", "REFUNDED"] } },
          select: {
            id: true,
            receiptNo: true,
            amount: true,
            status: true,
            allocations: { select: { amount: true } },
            reversals: { select: { id: true } },
          },
        }),
        prisma.studentCharge.findMany({
          where: { schoolId },
          select: {
            id: true,
            amountPaid: true,
            balance: true,
            finalAmountDue: true,
            allocations: {
              where: { payment: { status: "COMPLETED" } },
              select: { amount: true },
            },
          },
        }),
        prisma.expense.findMany({
          where: { schoolId, status: "REVERSED" },
          select: { id: true, voucherNo: true, reversals: { select: { id: true } } },
        }),
        prisma.payrollRun.findMany({
          where: { schoolId, status: { in: ["PAID", "REVERSED"] } },
          select: {
            id: true,
            year: true,
            month: true,
            status: true,
            totalNet: true,
            reversals: { select: { id: true } },
            payments: {
              select: { amount: true, expense: { select: { id: true, status: true } } },
            },
          },
        }),
        prisma.classTermResultWorkflow.findMany({
          where: { classTerm: { class: { schoolId } }, status: { in: ["PUBLISHED", "LOCKED"] } },
          select: { id: true, classTermId: true, gradingSnapshot: true, assessmentSchemeSnapshot: true },
        }),
        prisma.studentClassTerm.findMany({
          where: { student: { schoolId } },
          select: {
            id: true,
            studentId: true,
            classTermId: true,
            termId: true,
            status: true,
            // The names, so a finding reads as something a person can act on rather than
            // two UUIDs. An integrity report nobody can follow up is not a report.
            classTerm: {
              select: {
                class: { select: { name: true } },
                term: { select: { name: true, session: { select: { name: true } } } },
              },
            },
            student: {
              select: {
                admissionNo: true,
                user: { select: { firstName: true, lastName: true } },
                enrollmentHistory: { select: { classTermId: true, action: true } },
              },
            },
          },
        }),
      ])

    const issues: IntegrityIssue[] = []
    const add = (issue: IntegrityIssue) => issues.push(issue)

    if (sessions.length !== 1 || terms.length !== 1) {
      add({
        code: "CURRENT_PERIOD_CARDINALITY",
        severity: "ERROR",
        entityType: "School",
        entityId: schoolId,
        message: `Expected one current session and term; found ${sessions.length} session(s) and ${terms.length} term(s).`,
      })
    }
    if (!pointer || pointer.sessionId !== sessions[0]?.id || pointer.termId !== terms[0]?.id || terms[0]?.sessionId !== sessions[0]?.id) {
      add({
        code: "CURRENT_PERIOD_POINTER",
        severity: "ERROR",
        entityType: "SchoolAcademicPeriod",
        entityId: pointer?.id ?? null,
        message: "The database current-period pointer and compatibility flags do not agree.",
      })
    }

    for (const payment of payments) {
      const allocated = payment.allocations.reduce((sum, item) => sum.plus(item.amount), decimal(0))
      if (!allocated.equals(payment.amount)) {
        add({
          code: "PAYMENT_ALLOCATION_TOTAL",
          severity: "ERROR",
          entityType: "Payment",
          entityId: payment.id,
          message: `${payment.receiptNo} is ${payment.amount.toFixed(2)} but allocations total ${allocated.toFixed(2)}.`,
        })
      }
      if (payment.status === "REFUNDED" && payment.reversals.length !== 1) {
        add({
          code: "REFUND_REVERSAL_MISSING",
          severity: "ERROR",
          entityType: "Payment",
          entityId: payment.id,
          message: `${payment.receiptNo} is refunded without exactly one reversal record.`,
        })
      }
    }

    for (const charge of charges) {
      const allocated = charge.allocations.reduce((sum, item) => sum.plus(item.amount), decimal(0))
      if (!allocated.equals(charge.amountPaid) || !charge.amountPaid.plus(charge.balance).equals(charge.finalAmountDue)) {
        add({
          code: "CHARGE_BALANCE_MISMATCH",
          severity: "ERROR",
          entityType: "StudentCharge",
          entityId: charge.id,
          message: "Charge paid/balance figures do not reconcile with completed receipt allocations.",
        })
      }
    }

    for (const expense of expenses) {
      if (expense.reversals.length !== 1) {
        add({
          code: "EXPENSE_REVERSAL_MISSING",
          severity: "ERROR",
          entityType: "Expense",
          entityId: expense.id,
          message: `${expense.voucherNo} is reversed without exactly one reversal record.`,
        })
      }
    }

    for (const run of payrollRuns) {
      const paid = run.payments.reduce((sum, payment) => sum.plus(payment.amount), decimal(0))
      if (!paid.equals(run.totalNet)) {
        add({
          code: "PAYROLL_PAYMENT_TOTAL",
          severity: "ERROR",
          entityType: "PayrollRun",
          entityId: run.id,
          message: `${run.year}-${String(run.month).padStart(2, "0")} payment total does not match net payroll.`,
        })
      }
      if (run.status === "REVERSED" && run.reversals.length !== 1) {
        add({
          code: "PAYROLL_REVERSAL_MISSING",
          severity: "ERROR",
          entityType: "PayrollRun",
          entityId: run.id,
          message: "Reversed payroll has no unique payroll reversal record.",
        })
      }
      if (run.payments.some((payment) => !payment.expense || payment.expense.status !== run.status)) {
        add({
          code: "PAYROLL_EXPENSE_STATUS",
          severity: "ERROR",
          entityType: "PayrollRun",
          entityId: run.id,
          message: "Payroll status and its linked expenditure record are not aligned.",
        })
      }
    }

    for (const workflow of workflows) {
      if (!workflow.gradingSnapshot || !workflow.assessmentSchemeSnapshot) {
        add({
          code: "RESULT_POLICY_SNAPSHOT",
          severity: "WARNING",
          entityType: "ClassTermResultWorkflow",
          entityId: workflow.id,
          message: `Published class term ${workflow.classTermId} has no complete historical policy snapshot.`,
        })
      }
    }

    for (const enrollment of enrollments) {
      const hasHistory = enrollment.student.enrollmentHistory.some((event) => event.classTermId === enrollment.classTermId)
      if (!hasHistory) {
        const who = `${enrollment.student.user.firstName} ${enrollment.student.user.lastName}`
        const where = [
          enrollment.classTerm.class.name,
          enrollment.classTerm.term.name,
          enrollment.classTerm.term.session.name,
        ]
          .filter(Boolean)
          .join(" · ")

        add({
          code: "ENROLLMENT_HISTORY_MISSING",
          severity: "WARNING",
          entityType: "StudentClassTerm",
          entityId: enrollment.id,
          message:
            `${who} (${enrollment.student.admissionNo}) is enrolled in ${where} with no immutable ` +
            `history event, so the enrolment cannot say when or by whom it was made.`,
        })
      }
    }

    const completedAt = new Date()
    await prisma.dataIntegrityCheck.update({
      where: { id: check.id },
      data: {
        status: "COMPLETED",
        issuesFound: issues.length,
        results: issues as unknown as Prisma.InputJsonValue,
        completedAt,
        resolvedAt: issues.length === 0 ? completedAt : null,
      },
    })
    return { id: check.id, issues, completedAt }
  } catch (error) {
    await prisma.dataIntegrityCheck.update({
      where: { id: check.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        results: { error: error instanceof Error ? error.message : "Integrity check failed" },
      },
    })
    throw error
  }
}
