import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `loadGradingSystem` is wrapped in Next's `unstable_cache`, which needs a request context
 * and throws outside one. Only the grading bands come from it, and the bands are not what
 * this file is testing — the aggregation is. So it is replaced with a fixed WAEC-style
 * scale, which also keeps the expected grades stable if a school edits its own.
 */
vi.mock("@/lib/grading.server", () => ({
  loadGradingSystem: async () => ({
    passMark: 40,
    levels: [
      { minScore: 75, maxScore: 100, grade: "A1", remark: "Excellent" },
      { minScore: 70, maxScore: 74, grade: "B2", remark: "Very Good" },
      { minScore: 65, maxScore: 69, grade: "B3", remark: "Good" },
      { minScore: 60, maxScore: 64, grade: "C4", remark: "Credit" },
      { minScore: 55, maxScore: 59, grade: "C5", remark: "Credit" },
      { minScore: 50, maxScore: 54, grade: "C6", remark: "Credit" },
      { minScore: 45, maxScore: 49, grade: "D7", remark: "Pass" },
      { minScore: 40, maxScore: 44, grade: "E8", remark: "Pass" },
      { minScore: 0, maxScore: 39, grade: "F9", remark: "Fail" },
    ],
  }),
  gradeScoreForSchool: async () => ({ grade: "C6", remark: "Credit" }),
}))


/**
 * The sessional report's arithmetic, against a real database.
 *
 * A session card is not a term card with a different title: each subject is averaged over
 * the terms it was actually sat in, the three score columns carry terms rather than
 * continuous assessments, and positions are worked out across the year rather than copied
 * from one term. None of that is checkable from a unit test with invented rows, because the
 * thing most likely to be wrong is how the terms line up with the columns.
 */

const { prisma } = await import("@/lib/db")
const { buildSessionClassReport, buildSessionReportForStudent } = await import(
  "@/lib/results/session-report.server"
)
const { sessionTermLabel } = await import("@/lib/results/session-labels")

describe("buildSessionClassReport", () => {
  it("lines the score columns up with the session's terms, in calendar order", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) {
      console.warn("No class with published results in a session; skipping")
      return
    }

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    expect(report).not.toBeNull()
    if (!report) return

    // The terms must be in calendar order, because column one is whichever term came first.
    const starts = await prisma.term.findMany({
      where: { id: { in: report.terms.map((term) => term.id) } },
      orderBy: { startDate: "asc" },
      select: { id: true },
    })
    expect(report.terms.map((term) => term.id)).toEqual(starts.map((term) => term.id))
  })

  it("carries each term's total in its own column, then the sum and the average", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    if (!report) return

    const student = report.students.find((row) => Object.keys(row.subjects).length > 0)
    expect(student).toBeDefined()
    if (!student) return

    const [subjectId, result] = Object.entries(student.subjects)[0]!

    // The same marks, read straight from the database.
    const rows = await prisma.assessment.findMany({
      where: {
        studentId: student.studentId,
        subjectId,
        termId: { in: report.terms.map((term) => term.id) },
        isPublished: true,
        isAbsent: false,
        isExempt: false,
      },
      select: { termId: true, ca1: true, ca2: true, ca3: true, exam: true },
    })

    const byTerm = new Map(
      rows.map((row) => [
        row.termId,
        (row.ca1 ?? 0) + (row.ca2 ?? 0) + (row.ca3 ?? 0) + (row.exam ?? 0),
      ]),
    )

    const columns = [result.ca1, result.ca2, result.ca3]
    report.terms.forEach((term, index) => {
      expect(columns[index] ?? null).toBe(byTerm.get(term.id) ?? null)
    })

    const sat = [...byTerm.values()]
    expect(result.exam).toBe(sat.reduce((sum, value) => sum + value, 0))
    expect(result.score).toBe(Math.round(sat.reduce((sum, value) => sum + value, 0) / sat.length))
  })

  it("totals the subject averages, so Total and Average agree on the same row", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    if (!report) return

    // The broadsheet prints each subject's session average, then a Total beside them. It
    // previously totalled the raw term marks instead, so Total did not add up to the row it
    // sat on and two learners who sat a different number of terms could not be compared.
    for (const student of report.students) {
      const averages = Object.values(student.subjects)
        .map((row) => row.score)
        .filter((score): score is number => score !== null)
      if (averages.length === 0) continue

      const sum = averages.reduce((total, value) => total + value, 0)
      expect(Math.abs(student.totalScore - sum)).toBeLessThanOrEqual(averages.length)
      expect(Math.abs(student.averageScore - sum / averages.length)).toBeLessThanOrEqual(1)
    }
  })

  it("ranks the class over the session, with no gaps and no duplicates", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    if (!report || report.students.length === 0) return

    const positions = report.students.map((row) => row.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(new Set(positions).size).toBe(positions.length)
    expect(Math.min(...positions)).toBe(1)
    expect(Math.max(...positions)).toBe(report.students.length)

    // A higher average must never sit below a lower one.
    for (let index = 1; index < report.students.length; index += 1) {
      expect(report.students[index - 1]!.averageScore).toBeGreaterThanOrEqual(
        report.students[index]!.averageScore,
      )
    }
  })

  it("keeps the class statistics consistent with the learners it reports", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    if (!report || report.students.length === 0) return

    const averages = report.students.map((row) => row.averageScore).filter((value) => value > 0)
    if (averages.length === 0) return

    expect(report.statistics.highestTotal).toBeGreaterThanOrEqual(Math.max(...averages) - 1)
    expect(report.statistics.lowestTotal).toBeLessThanOrEqual(Math.min(...averages) + 1)
    expect(report.statistics.classAverage).toBeGreaterThan(0)
    expect(report.statistics.classAverage).toBeLessThanOrEqual(100)
  })

  it("refuses a class and session belonging to a different school", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(
      found.classId,
      found.sessionId,
      "00000000-0000-0000-0000-000000000000",
    )
    expect(report).toBeNull()
  })
})

/**
 * The promotion decision's last mile.
 *
 * Deciding and approving are separate acts, and the same builder feeds the parent and
 * student portals. So an unapproved decision reaching a family would show them "Repeat"
 * before the principal had signed it — which is the failure this pins down. The write side
 * is covered by annual-results-flow; this is the read side, where it becomes a report card.
 */
describe("an annual decision on a report card", () => {
  const STAMP = "ZZSessionDecision"

  afterEach(async () => {
    await prisma.annualResultDecision.deleteMany({ where: { principalComment: STAMP } })
  })

  it("carries an approved decision through to the learner's card, and withholds it until approved", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) {
      console.warn("No class with published results in a session; skipping")
      return
    }

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    const target = report?.students.find((row) => Object.keys(row.subjects).length > 0)
    if (!target) return

    // No decision at all: the card says nothing rather than guessing.
    const before = await buildSessionReportForStudent(
      target.studentId,
      found.sessionId,
      found.schoolId,
    )
    expect(before?.student.annualDecision).toBe("PENDING")

    // Decided but NOT approved — still nothing, because a family must not read it first.
    const decision = await prisma.annualResultDecision.create({
      data: {
        schoolId: found.schoolId,
        sessionId: found.sessionId,
        classId: found.classId,
        studentId: target.studentId,
        decision: "PROMOTED",
        principalComment: STAMP,
        subjectsOffered: 8,
        subjectsPassed: 8,
        creditsEarned: 5,
        termsCounted: 3,
      },
      select: { id: true },
    })

    const unapproved = await buildSessionReportForStudent(
      target.studentId,
      found.sessionId,
      found.schoolId,
    )
    expect(unapproved?.student.annualDecision).toBe("PENDING")
    expect(unapproved?.student.principalComment ?? null).toBeFalsy()

    // Approved: now, and only now, it reaches the card.
    await prisma.annualResultDecision.update({
      where: { id: decision.id },
      data: { approvedAt: new Date() },
    })

    const approved = await buildSessionReportForStudent(
      target.studentId,
      found.sessionId,
      found.schoolId,
    )
    expect(approved?.student.annualDecision).toBe("PROMOTED")
    expect(approved?.student.principalComment).toBe(STAMP)
  })

  it("keeps one learner's decision off another learner's card", async () => {
    const found = await findClassWithPublishedSession()
    if (!found) return

    const report = await buildSessionClassReport(found.classId, found.sessionId, found.schoolId)
    const marked = report?.students.filter((row) => Object.keys(row.subjects).length > 0) ?? []
    if (marked.length < 2) return

    await prisma.annualResultDecision.create({
      data: {
        schoolId: found.schoolId,
        sessionId: found.sessionId,
        classId: found.classId,
        studentId: marked[0]!.studentId,
        decision: "REPEATED",
        principalComment: STAMP,
        subjectsOffered: 8,
        subjectsPassed: 2,
        creditsEarned: 0,
        termsCounted: 3,
        approvedAt: new Date(),
      },
    })

    const other = await buildSessionReportForStudent(
      marked[1]!.studentId,
      found.sessionId,
      found.schoolId,
    )
    expect(other?.student.annualDecision).toBe("PENDING")
  })
})

/** A class that actually ran a session and has released marks in it. */
async function findClassWithPublishedSession() {
  const assessment = await prisma.assessment.findFirst({
    where: { isPublished: true },
    select: {
      termId: true,
      studentClassTerm: {
        select: { classTerm: { select: { classId: true, class: { select: { schoolId: true } } } } },
      },
    },
  })
  if (!assessment?.studentClassTerm) return null

  const term = await prisma.term.findUnique({
    where: { id: assessment.termId },
    select: { sessionId: true },
  })
  if (!term) return null

  return {
    classId: assessment.studentClassTerm.classTerm.classId,
    sessionId: term.sessionId,
    schoolId: assessment.studentClassTerm.classTerm.class.schoolId,
  }
}

describe("sessionTermLabel", () => {
  it("names a range short enough to fit the card's Term field", () => {
    expect(
      sessionTermLabel([{ name: "First Term" }, { name: "Second Term" }, { name: "Third Term" }]),
    ).toBe("Sessional (1st–3rd Term)")
  })

  it("names the one term rather than pretending to a range", () => {
    expect(sessionTermLabel([{ name: "Third Term" }])).toBe("Sessional (3rd Term)")
  })

  it("handles a two-term session", () => {
    expect(sessionTermLabel([{ name: "First Term" }, { name: "Second Term" }])).toBe(
      "Sessional (1st–2nd Term)",
    )
  })

  it("falls back to the term's own name when it is not an ordinal one", () => {
    expect(sessionTermLabel([{ name: "Summer" }])).toBe("Sessional (Summer Term)")
  })

  it("says something sensible with no terms at all", () => {
    expect(sessionTermLabel([])).toBe("Sessional Summary")
  })
})
