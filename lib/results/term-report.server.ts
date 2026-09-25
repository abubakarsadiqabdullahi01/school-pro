import { prisma } from "@/lib/db"
import { loadGradingSystem } from "@/lib/grading.server"
import { resolveGrade } from "@/lib/grading"
import { PUBLISHED_ONLY, subjectTotal } from "@/lib/results-visibility"
import type {
  SessionClassReport,
  SessionReportForStudent,
  SessionStudentResult,
  SessionSubjectResult,
} from "./session-report.server"

/**
 * One term's results for a whole class, in the shape the termly report card expects.
 *
 * The staff screens get this from `getStudentReportData`, which requires
 * `compiler.review_results` and deliberately ignores publication so an exam officer can see
 * drafts before releasing them. Neither is right for a family, so this is the portal's own
 * path: published marks only, with the caller deciding who may see it.
 *
 * It returns the same shape as the sessional builder so both feed the one report-card
 * generator. The difference is only what the five score columns carry — three continuous
 * assessments and an exam here, three terms and a total there.
 */
export async function buildTermClassReport(
  classId: string,
  termId: string,
  schoolId: string,
): Promise<SessionClassReport | null> {
  const [classRow, term, grading] = await Promise.all([
    prisma.class.findUnique({ where: { id: classId }, select: { name: true, schoolId: true } }),
    prisma.term.findUnique({
      where: { id: termId },
      select: {
        id: true,
        name: true,
        endDate: true,
        session: { select: { id: true, name: true, schoolId: true } },
      },
    }),
    loadGradingSystem(schoolId),
  ])

  if (!classRow || !term) return null
  if (classRow.schoolId !== schoolId || term.session.schoolId !== schoolId) return null

  const classTerm = await prisma.classTerm.findFirst({
    where: { classId, termId },
    select: {
      classSubjects: { select: { subject: { select: { id: true, name: true, code: true } } } },
      teachers: {
        take: 1,
        select: { teacher: { select: { user: { select: { firstName: true, lastName: true } } } } },
      },
      students: {
        select: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              user: { select: { firstName: true, lastName: true, gender: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })
  if (!classTerm) return null

  const subjects = classTerm.classSubjects
    .map((row) => row.subject)
    .sort((a, b) => a.name.localeCompare(b.name))

  const assessments = await prisma.assessment.findMany({
    where: {
      studentId: { in: classTerm.students.map((row) => row.student.id) },
      termId,
      ...PUBLISHED_ONLY,
    },
    select: {
      studentId: true,
      subjectId: true,
      ca1: true,
      ca2: true,
      ca3: true,
      exam: true,
      isAbsent: true,
      isExempt: true,
    },
  })

  type Mark = {
    ca1: number | null
    ca2: number | null
    ca3: number | null
    exam: number | null
    total: number
  }

  const marks = new Map<string, Map<string, Mark>>()
  for (const row of assessments) {
    if (row.isAbsent || row.isExempt) continue
    const total = subjectTotal(row)
    if (total === null) continue
    if (!marks.has(row.studentId)) marks.set(row.studentId, new Map())
    marks.get(row.studentId)!.set(row.subjectId, {
      ca1: row.ca1,
      ca2: row.ca2,
      ca3: row.ca3,
      exam: row.exam,
      total,
    })
  }

  const subjectHighest: Record<string, number> = {}
  const subjectLowest: Record<string, number> = {}
  const subjectAverage: Record<string, number> = {}
  const subjectRanking = new Map<string, Array<{ studentId: string; score: number }>>()

  for (const subject of subjects) {
    const scores = classTerm.students
      .map((row) => ({
        studentId: row.student.id,
        score: marks.get(row.student.id)?.get(subject.id)?.total,
      }))
      .filter((row): row is { studentId: string; score: number } => row.score !== undefined)

    const values = scores.map((row) => row.score)
    subjectHighest[subject.id] = values.length ? Math.max(...values) : 0
    subjectLowest[subject.id] = values.length ? Math.min(...values) : 0
    subjectAverage[subject.id] = values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0
    subjectRanking.set(subject.id, [...scores].sort((a, b) => b.score - a.score))
  }

  const overall = classTerm.students
    .map((row) => {
      const own = marks.get(row.student.id)
      const totals = own ? [...own.values()].map((mark) => mark.total) : []
      const totalScore = totals.reduce((sum, value) => sum + value, 0)
      return {
        studentId: row.student.id,
        totalScore,
        averageScore: totals.length ? totalScore / totals.length : 0,
      }
    })
    .sort((a, b) => b.averageScore - a.averageScore)

  const position = new Map(overall.map((row, index) => [row.studentId, index + 1]))
  const totalsById = new Map(overall.map((row) => [row.studentId, row]))

  const students: SessionStudentResult[] = classTerm.students.map(({ student }) => {
    const own = marks.get(student.id)
    const subjectResults: Record<string, SessionSubjectResult> = {}

    for (const subject of subjects) {
      const mark = own?.get(subject.id)
      if (!mark) continue

      const ranking = subjectRanking.get(subject.id) ?? []
      const rank = ranking.findIndex((row) => row.studentId === student.id)
      const resolved = resolveGrade(Math.round(mark.total), grading)

      subjectResults[subject.id] = {
        ca1: mark.ca1,
        ca2: mark.ca2,
        ca3: mark.ca3,
        exam: mark.exam,
        score: Math.round(mark.total),
        grade: resolved.grade,
        remark: resolved.remark,
        position: rank >= 0 ? rank + 1 : null,
        outOf: ranking.length,
        lowest: subjectLowest[subject.id] ?? 0,
        highest: subjectHighest[subject.id] ?? 0,
        average: subjectAverage[subject.id] ?? 0,
      }
    }

    const totals = totalsById.get(student.id)!
    const resolved = resolveGrade(Math.round(totals.averageScore), grading)

    return {
      studentId: student.id,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      admissionNo: student.admissionNo,
      gender: student.user.gender,
      passportUrl: student.user.avatarUrl,
      subjects: subjectResults,
      totalScore: Math.round(totals.totalScore),
      averageScore: Math.round(totals.averageScore),
      grade: resolved.grade,
      remark: resolved.remark ?? "",
      position: position.get(student.id) ?? 0,
      termsCounted: 1,
      // A termly card carries no end-of-session outcome. The decision belongs to a whole
      // session, and printing "Promoted" on a first-term report would be a promise the
      // school has not made yet.
      annualDecision: "PENDING" as const,
      principalComment: "",
    }
  })

  students.sort((a, b) => a.position - b.position)

  // Whichever term starts next, in this session or the one after. That is what "Next Term
  // Begins" means on a termly card.
  const nextTerm = await prisma.term.findFirst({
    where: { session: { schoolId }, startDate: { gt: term.endDate } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  })

  const teacherUser = classTerm.teachers[0]?.teacher.user
  const averages = overall.map((row) => row.averageScore).filter((value) => value > 0)

  return {
    session: {
      id: term.session.id,
      name: term.session.name,
      endDate: term.endDate.toISOString(),
      nextStartDate: nextTerm?.startDate.toISOString() ?? "",
    },
    className: classRow.name,
    teacherName: teacherUser ? `${teacherUser.firstName} ${teacherUser.lastName}` : "Not Assigned",
    terms: [{ id: term.id, name: term.name }],
    subjects,
    students,
    statistics: {
      highestTotal: averages.length ? Math.max(...averages) : 0,
      lowestTotal: averages.length ? Math.min(...averages) : 0,
      classAverage: averages.length
        ? averages.reduce((total, value) => total + value, 0) / averages.length
        : 0,
      subjectHighest,
      subjectLowest,
      subjectAverage,
    },
    gradingSystem: grading ?? { passMark: 40, levels: [] },
  }
}

/** One learner's termly card, with the class context the card prints around it. */
export async function buildTermReportForStudent(
  studentId: string,
  termId: string,
  schoolId: string,
): Promise<SessionReportForStudent | null> {
  const enrolment = await prisma.studentClassTerm.findFirst({
    where: { studentId, classTerm: { termId } },
    select: { classTerm: { select: { classId: true } } },
  })
  if (!enrolment) return null

  const [report, school] = await Promise.all([
    buildTermClassReport(enrolment.classTerm.classId, termId, schoolId),
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, code: true, address: true, phone: true, email: true, logoUrl: true },
    }),
  ])
  if (!report || !school) return null

  const student = report.students.find((row) => row.studentId === studentId)
  if (!student) return null

  return {
    report,
    student,
    school: {
      schoolName: school.name,
      schoolCode: school.code,
      schoolAddress: school.address ?? "",
      schoolPhone: school.phone ?? "",
      schoolEmail: school.email ?? "",
      schoolLogo: school.logoUrl,
    },
  }
}
