import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { computeCumulativeResult } from "@/lib/compiler-v2"
import { loadGradingSystem, gradeScoreForSchool } from "@/lib/grading.server"
import { PUBLISHED_ONLY, subjectTotal } from "@/lib/results-visibility"
import { canViewResults, canViewSessionSummary, type ResultAccess } from "./withholding-rules"
import { schoolWithholdsResults } from "./withholding.server"

/**
 * A learner's whole record, grouped by session and term.
 *
 * Both portals read this. The parent one and the student one used to hold separate copies
 * of a single term's query, which is how they came to disagree about nothing in particular
 * and would certainly have disagreed about this. Authorization stays with the callers —
 * this function trusts the id it is given, and the two actions that call it each establish
 * that the signed-in person is entitled to it before they do.
 *
 * Terms come back newest first, because the question a parent opens the portal with is
 * almost always about the term that just ended.
 */

export type HistorySubjectResult = {
  subject: string
  code: string
  ca: number | null
  exam: number | null
  total: number | null
  grade: string | null
}

export type HistoryTerm = {
  termId: string
  termName: string
  className: string | null
  /** Everything the class offered that term, whether or not a mark was recorded. */
  subjectsOffered: Array<{ name: string; code: string }>
  results: HistorySubjectResult[]
  average: number | null
  /** What is still owed for this term, as a display string. */
  balance: string
  access: ResultAccess
}

export type HistorySessionSummary = {
  access: ResultAccess
  subjects: Array<{ subject: string; termsCounted: number; total: number; average: number; passed: boolean }>
  totalAverage: number
  subjectsPassed: number
  subjectsCounted: number
  /** Terms with no mark at all for a subject the class offered. */
  incompleteSubjects: string[]
}

export type HistorySession = {
  sessionId: string
  sessionName: string
  terms: HistoryTerm[]
  summary: HistorySessionSummary | null
}

export type HistoryTransition = {
  id: string
  date: string
  type: string
  from: string
  to: string
  notes: string | null
}

export type AcademicHistory = {
  withholdEnabled: boolean
  sessions: HistorySession[]
  transitions: HistoryTransition[]
}

const money = (value: Prisma.Decimal.Value) => {
  const [whole, fraction] = new Prisma.Decimal(value).toFixed(2).split(".")
  return `₦${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`
}

export async function buildAcademicHistory(
  studentId: string,
  schoolId: string,
): Promise<AcademicHistory> {
  const [enrolments, assessments, charges, transitions, withholdEnabled, grading] =
    await Promise.all([
      prisma.studentClassTerm.findMany({
        where: { studentId },
        select: {
          classTerm: {
            select: {
              class: { select: { name: true } },
              classSubjects: { select: { subject: { select: { name: true, code: true } } } },
              term: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  session: { select: { id: true, name: true, startDate: true } },
                },
              },
            },
          },
        },
      }),
      prisma.assessment.findMany({
        where: { studentId, ...PUBLISHED_ONLY },
        select: {
          ca1: true,
          ca2: true,
          ca3: true,
          exam: true,
          isAbsent: true,
          isExempt: true,
          termId: true,
          subjectId: true,
          subject: { select: { name: true, code: true } },
        },
      }),
      // Balances are per term, because withholding is per term. A charge with no term on it
      // (a session-wide levy) cannot be attributed to one, so it is left out of the gate
      // rather than counted against every term at once.
      prisma.studentCharge.groupBy({
        by: ["termId"],
        where: { studentId, termId: { not: null } },
        _sum: { balance: true },
      }),
      prisma.studentTransition.findMany({
        where: { studentId },
        orderBy: { transitionDate: "desc" },
        select: {
          id: true,
          transitionType: true,
          transitionDate: true,
          notes: true,
          fromClassTerm: {
            select: { class: { select: { name: true } }, term: { select: { name: true } } },
          },
          toClassTerm: {
            select: { class: { select: { name: true } }, term: { select: { name: true } } },
          },
        },
      }),
      schoolWithholdsResults(schoolId),
      loadGradingSystem(schoolId),
    ])

  const balanceByTerm = new Map(
    charges.map((row) => [row.termId!, new Prisma.Decimal(row._sum.balance ?? 0)]),
  )

  // Grades are resolved against the school's own bands, so what a parent reads here matches
  // the report sheet rather than a second opinion computed from a hardcoded table.
  const gradeFor = async (total: number | null) =>
    total === null ? null : (await gradeScoreForSchool(total, schoolId)).grade

  const sessions = new Map<string, HistorySession & { sortKey: number }>()

  for (const enrolment of enrolments) {
    const term = enrolment.classTerm.term
    const session = term.session

    if (!sessions.has(session.id)) {
      sessions.set(session.id, {
        sessionId: session.id,
        sessionName: session.name,
        terms: [],
        summary: null,
        sortKey: session.startDate ? new Date(session.startDate).getTime() : 0,
      })
    }

    const termAssessments = assessments.filter((row) => row.termId === term.id)
    const results: HistorySubjectResult[] = await Promise.all(
      termAssessments.map(async (row) => {
        const total = subjectTotal(row)
        const ca = [row.ca1, row.ca2, row.ca3].every((part) => part === null)
          ? null
          : (row.ca1 ?? 0) + (row.ca2 ?? 0) + (row.ca3 ?? 0)
        return {
          subject: row.subject.name,
          code: row.subject.code,
          ca,
          exam: row.exam,
          total,
          grade: await gradeFor(total),
        }
      }),
    )

    const totals = results.map((row) => row.total).filter((total): total is number => total !== null)
    const balance = balanceByTerm.get(term.id) ?? new Prisma.Decimal(0)

    sessions.get(session.id)!.terms.push({
      termId: term.id,
      termName: term.name,
      className: enrolment.classTerm.class?.name ?? null,
      subjectsOffered: enrolment.classTerm.classSubjects.map((row) => ({
        name: row.subject.name,
        code: row.subject.code,
      })),
      results,
      average: totals.length === 0 ? null : Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      balance: money(balance),
      access: canViewResults({
        withholdEnabled,
        balanceOwing: balance.toNumber(),
        periodLabel: `${term.name}, ${session.name}`,
      }),
    })
  }

  // Newest first, within a session and across sessions.
  const ordered = [...sessions.values()].sort((a, b) => b.sortKey - a.sortKey)
  const termOrder = new Map(
    enrolments.map((e) => [
      e.classTerm.term.id,
      e.classTerm.term.startDate ? new Date(e.classTerm.term.startDate).getTime() : 0,
    ]),
  )
  for (const session of ordered) {
    session.terms.sort((a, b) => (termOrder.get(b.termId) ?? 0) - (termOrder.get(a.termId) ?? 0))
  }

  const passMark = grading?.passMark ?? 40

  for (const session of ordered) {
    session.summary = summariseSession(session, assessments, passMark)
  }

  return {
    withholdEnabled,
    sessions: ordered.map(({ sortKey: _sortKey, ...session }) => session),
    transitions: transitions.map((row) => ({
      id: row.id,
      date: row.transitionDate.toISOString(),
      type: row.transitionType,
      from: `${row.fromClassTerm.class?.name ?? "—"} · ${row.fromClassTerm.term?.name ?? "—"}`,
      to: `${row.toClassTerm.class?.name ?? "—"} · ${row.toClassTerm.term?.name ?? "—"}`,
      notes: row.notes,
    })),
  }
}

/**
 * The session summary: each subject averaged across the terms it was sat in, and the
 * average of those averages.
 *
 * The arithmetic is `computeCumulativeResult`, which already existed with tests and was
 * wired to nothing. Reusing it means the number a parent reads is the same one the
 * promotion decision was made on — which is the entire point of showing it.
 */
function summariseSession(
  session: HistorySession,
  assessments: Array<{
    termId: string
    subjectId: string
    ca1: number | null
    ca2: number | null
    ca3: number | null
    exam: number | null
    isAbsent: boolean | null
    isExempt: boolean | null
    subject: { name: string }
  }>,
  passMark: number,
): HistorySessionSummary | null {
  if (session.terms.length === 0) return null

  const access = canViewSessionSummary(
    session.terms.map((term) => ({ access: term.access, termName: term.termName })),
  )

  const termIds = new Set(session.terms.map((term) => term.termId))
  const rows = assessments.filter((row) => termIds.has(row.termId))
  if (rows.length === 0) return { ...emptySummary(), access }

  const subjectIds = [...new Set(rows.map((row) => row.subjectId))]
  const nameById = new Map(rows.map((row) => [row.subjectId, row.subject.name]))

  const cumulative = computeCumulativeResult(
    rows.map((row) => ({
      termId: row.termId,
      subjectId: row.subjectId,
      score: subjectTotal(row),
      isAbsent: row.isAbsent ?? false,
      isExempt: row.isExempt ?? false,
      isPublished: true,
    })),
    subjectIds,
    passMark,
  )

  return {
    access,
    subjects: cumulative.subjectResults.map((row) => ({
      subject: nameById.get(row.subjectId) ?? row.subjectId,
      termsCounted: row.termsCounted,
      total: Math.round(row.total),
      average: Math.round(row.average),
      passed: row.passed,
    })),
    totalAverage: Math.round(cumulative.totalAverage),
    subjectsPassed: cumulative.subjectsPassed,
    subjectsCounted: cumulative.subjectsCounted,
    incompleteSubjects: cumulative.missingSubjectIds.map((id) => nameById.get(id) ?? id),
  }
}

function emptySummary(): Omit<HistorySessionSummary, "access"> & { access: ResultAccess } {
  return {
    access: { allowed: true },
    subjects: [],
    totalAverage: 0,
    subjectsPassed: 0,
    subjectsCounted: 0,
    incompleteSubjects: [],
  }
}
