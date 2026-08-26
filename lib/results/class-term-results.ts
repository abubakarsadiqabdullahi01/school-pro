import type { Gender } from "@prisma/client"
import { gradeForScore, type ScoreBand } from "@/lib/grading"

/**
 * Pure class-term result aggregation.
 *
 * Extracted verbatim from `getClassTermResults` in `app/actions/compiler.ts` so the
 * arithmetic can be tested without a database. The behaviour here is deliberately
 * identical to what that action did before the extraction, including its known quirks —
 * see `lib/results/class-term-results.test.ts`, which documents each one. Change the
 * behaviour only with the tests updated in the same commit.
 */

export type { ScoreBand } from "@/lib/grading"

/** A student enrolled in the class term, in the order results should be built. */
export interface ResultStudent {
  studentId: string
  studentName: string
  admissionNo: string
  gender: Gender | null
}

/** One `Assessment` row, reduced to the fields the aggregation reads. */
export interface ResultAssessment {
  studentId: string
  subjectId: string
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
  isAbsent: boolean
  isExempt: boolean
}

export interface SubjectResult {
  score: number | null
  grade: string | null
}

export interface ClassTermResultRow {
  studentId: string
  studentName: string
  admissionNo: string
  gender: Gender | null
  subjects: Record<string, SubjectResult>
  totalScore: number
  averageScore: number
  grade: string
  position: number
}

export interface BuildClassTermResultsInput {
  students: ResultStudent[]
  /** Every subject offered by the class term — the columns of the result sheet. */
  subjectIds: string[]
  assessments: ResultAssessment[]
  /** The school's grade bands. Order is preserved; the first match wins. */
  gradeBands: ScoreBand[]
}

/**
 * A subject counts toward the total only when every component is present and the student
 * was neither absent nor exempt. An incomplete subject leaves both the numerator and the
 * denominator, so a partly-entered term does not depress averages.
 */
export function subjectTotal(assessment: ResultAssessment | undefined): number | null {
  const isComplete =
    assessment &&
    !assessment.isExempt &&
    !assessment.isAbsent &&
    assessment.ca1 !== null &&
    assessment.ca2 !== null &&
    assessment.ca3 !== null &&
    assessment.exam !== null

  if (!isComplete) return null

  return (assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0) + (assessment.exam ?? 0)
}

// Band matching lives in lib/grading — this module used to have its own copy, which was
// the only one that floored correctly. Re-exported so existing importers are unaffected.
export { gradeForScore } from "@/lib/grading"

/**
 * Assigns positions by descending total score, with ties sharing a position and the next
 * distinct score skipping the tied places (1, 2, 2, 4).
 *
 * Returns rows in position order, not the input order.
 */
export function assignPositions<T extends { totalScore: number }>(rows: T[]): (T & { position: number })[] {
  const sorted = [...rows].sort((a, b) => b.totalScore - a.totalScore)

  let currentPosition = 1
  let previousScore: number | null = null
  let tieCount = 0

  return sorted.map((row) => {
    const currentScore = row.totalScore

    if (previousScore !== null && currentScore < previousScore) {
      currentPosition += tieCount
      tieCount = 1
    } else if (currentScore === previousScore) {
      tieCount++
    } else {
      tieCount = 1
    }

    previousScore = currentScore
    return { ...row, position: currentPosition }
  })
}

export function buildClassTermResults({
  students,
  subjectIds,
  assessments,
  gradeBands,
}: BuildClassTermResultsInput): ClassTermResultRow[] {
  const rows = students.map((student) => {
    const studentAssessments = assessments.filter((a) => a.studentId === student.studentId)

    let totalScore = 0
    let subjectCount = 0
    const subjects: Record<string, SubjectResult> = {}

    for (const subjectId of subjectIds) {
      const assessment = studentAssessments.find((a) => a.subjectId === subjectId)
      const total = subjectTotal(assessment)

      if (total !== null) {
        totalScore += total
        subjectCount++
      }

      subjects[subjectId] = { score: total, grade: gradeForScore(total, gradeBands) }
    }

    const averageScore = subjectCount > 0 ? totalScore / subjectCount : 0

    return {
      studentId: student.studentId,
      studentName: student.studentName,
      admissionNo: student.admissionNo,
      gender: student.gender,
      subjects,
      totalScore,
      averageScore,
      grade: gradeForScore(averageScore, gradeBands) ?? "",
      position: 0,
    }
  })

  return assignPositions(rows)
}
