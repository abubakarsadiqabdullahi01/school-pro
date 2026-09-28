import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const {
  getAssessmentsWithStatus,
  saveAssessments: saveAdminAssessments,
} = await import("@/app/actions/compiler-improved")
const {
  getClassStatistics,
  getStudentReportData,
} = await import("@/app/actions/student-reports")
const {
  getClassTermResults,
  getStudentsForClassTerm,
  publishClassTermResults,
  unpublishClassTermResults,
} = await import("@/app/actions/compiler")
const {
  saveTeacherAssessments,
} = await import("@/app/actions/teacher-compiler")

const STAMP = `ZZ Compiler ${Date.now()}`

function ok<T>(result: { success: boolean; data?: T; error?: unknown; message?: string }, label: string): T {
  if (!result.success) throw new Error(`${label} failed: ${String(result.error ?? result.message)}`)
  if (result.data === undefined) throw new Error(`${label} returned no data`)
  return result.data
}

const created = {
  schoolId: "",
  userIds: [] as string[],
}

let adminUserId = ""
let teacherUserId = ""
let teacherId = ""
let termId = ""
let classTermId = ""
let subjectId = ""
let activeStudentId = ""
let activeStudentClassTermId = ""
let completedStudentId = ""
let completedStudentClassTermId = ""
let droppedStudentId = ""
let droppedStudentClassTermId = ""

function actAsAdmin() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: adminUserId, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

function actAsTeacher() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: teacherUserId, role: "TEACHER", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

beforeAll(async () => {
  const [adminUser, teacherUser, activeUser, completedUser, droppedUser] = await Promise.all([
    prisma.user.create({
      data: { firstName: "Compiler", lastName: "Admin", role: "ADMIN", isActive: true },
      select: { id: true },
    }),
    prisma.user.create({
      data: { firstName: "Compiler", lastName: "Teacher", role: "TEACHER", isActive: true },
      select: { id: true },
    }),
    prisma.user.create({
      data: { firstName: "Ada", lastName: "Active", role: "STUDENT", isActive: true, gender: "FEMALE" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { firstName: "Ben", lastName: "Completed", role: "STUDENT", isActive: true, gender: "MALE" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { firstName: "Cy", lastName: "Dropped", role: "STUDENT", isActive: true, gender: "OTHER" },
      select: { id: true },
    }),
  ])

  adminUserId = adminUser.id
  teacherUserId = teacherUser.id
  created.userIds.push(adminUser.id, teacherUser.id, activeUser.id, completedUser.id, droppedUser.id)

  const school = await prisma.school.create({
    data: {
      name: `${STAMP} School`,
      code: `CMP-${Date.now()}`,
      address: "Compiler Integration Street",
      phone: "08000000001",
      email: `compiler-${Date.now()}@example.test`,
      admins: { create: { userId: adminUser.id, permissions: "[]" } },
    },
    select: { id: true },
  })
  created.schoolId = school.id

  const [teacher, session, subject, klass, gradingSystem, _scheme] = await Promise.all([
    prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        schoolId: school.id,
        staffId: `CMP-T-${Date.now()}`,
        department: "Academics",
      },
      select: { id: true },
    }),
    prisma.session.create({
      data: {
        schoolId: school.id,
        name: `${STAMP} Session`,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2027-07-31T00:00:00.000Z"),
        isCurrent: true,
      },
      select: { id: true },
    }),
    prisma.subject.create({
      data: { schoolId: school.id, name: "Compiler Mathematics", code: `CM${Date.now()}` },
      select: { id: true },
    }),
    prisma.class.create({
      data: { schoolId: school.id, name: "JSS Compiler", level: "JSS" },
      select: { id: true },
    }),
    prisma.gradingSystem.create({
      data: {
        schoolId: school.id,
        name: "Compiler Standard",
        isDefault: true,
        passMark: 40,
      },
      select: { id: true },
    }),
    // Publishing needs a scheme as well as a scale: it is what says a mark out of 10 is a
    // CA and one out of 70 is the exam. The defaults match the marks entered below, so the
    // totals the assertions expect are the ones the school's own scheme produces.
    prisma.assessmentScheme.create({
      data: { schoolId: school.id, name: `${STAMP} Scheme` },
      select: { id: true },
    }),
  ])

  teacherId = teacher.id
  subjectId = subject.id

  await prisma.gradeLevel.createMany({
    data: [
      { gradingSystemId: gradingSystem.id, minScore: 70, maxScore: 100, grade: "A", remark: "Excellent" },
      { gradingSystemId: gradingSystem.id, minScore: 40, maxScore: 69, grade: "C", remark: "Pass" },
      { gradingSystemId: gradingSystem.id, minScore: 0, maxScore: 39, grade: "F", remark: "Fail" },
    ],
  })

  const term = await prisma.term.create({
    data: {
      sessionId: session.id,
      name: "First Term",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-15T00:00:00.000Z"),
      isCurrent: true,
    },
    select: { id: true },
  })
  termId = term.id

  const classTerm = await prisma.classTerm.create({
    data: { classId: klass.id, termId: term.id },
    select: { id: true },
  })
  classTermId = classTerm.id

  await Promise.all([
    prisma.classSubject.create({ data: { classId: klass.id, classTermId: classTerm.id, subjectId: subject.id } }),
    prisma.teacherClassTerm.create({ data: { teacherId: teacher.id, classTermId: classTerm.id } }),
    prisma.teacherSubject.create({ data: { teacherId: teacher.id, subjectId: subject.id, termId: term.id } }),
  ])

  const [activeStudent, completedStudent, droppedStudent] = await Promise.all([
    prisma.student.create({
      data: { userId: activeUser.id, schoolId: school.id, admissionNo: `CMP-A-${Date.now()}`, year: 2026 },
      select: { id: true },
    }),
    prisma.student.create({
      data: { userId: completedUser.id, schoolId: school.id, admissionNo: `CMP-C-${Date.now()}`, year: 2026 },
      select: { id: true },
    }),
    prisma.student.create({
      data: { userId: droppedUser.id, schoolId: school.id, admissionNo: `CMP-D-${Date.now()}`, year: 2026 },
      select: { id: true },
    }),
  ])
  activeStudentId = activeStudent.id
  completedStudentId = completedStudent.id
  droppedStudentId = droppedStudent.id

  const [activeSct, completedSct, droppedSct] = await Promise.all([
    prisma.studentClassTerm.create({
      data: { studentId: activeStudent.id, classTermId: classTerm.id, termId: term.id, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.studentClassTerm.create({
      data: { studentId: completedStudent.id, classTermId: classTerm.id, termId: term.id, status: "COMPLETED" },
      select: { id: true },
    }),
    prisma.studentClassTerm.create({
      data: { studentId: droppedStudent.id, classTermId: classTerm.id, termId: term.id, status: "DROPPED" },
      select: { id: true },
    }),
  ])
  activeStudentClassTermId = activeSct.id
  completedStudentClassTermId = completedSct.id
  droppedStudentClassTermId = droppedSct.id

  actAsAdmin()
})

afterAll(async () => {
  if (created.schoolId) {
    await prisma.school.deleteMany({ where: { id: created.schoolId } })
  }
  if (created.userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  }
  await prisma.$disconnect()
})

describe("compiler integration", () => {
  it("keeps completed term results visible while excluding dropped enrolments", async () => {
    actAsAdmin()

    ok(
      await saveAdminAssessments(
        [
          {
            studentId: activeStudentId,
            studentClassTermId: activeStudentClassTermId,
            subjectId,
            termId,
            ca1: 8,
            ca2: 8,
            ca3: 9,
            exam: 60,
          },
          {
            studentId: completedStudentId,
            studentClassTermId: completedStudentClassTermId,
            subjectId,
            termId,
            ca1: 6,
            ca2: 6,
            ca3: 7,
            exam: 45,
          },
        ],
        termId,
        subjectId,
      ),
      "save admin assessments",
    )

    await prisma.assessment.create({
      data: {
        studentId: droppedStudentId,
        studentClassTermId: droppedStudentClassTermId,
        subjectId,
        termId,
        teacherId,
        ca1: 10,
        ca2: 10,
        ca3: 10,
        exam: 70,
        editedBy: adminUserId,
        createdBy: adminUserId,
      },
    })

    const roster = ok(await getStudentsForClassTerm(classTermId), "get compiler roster")
    expect(roster.map((student) => student.id)).toEqual([activeStudentId, completedStudentId])

    const assessments = ok(
      await getAssessmentsWithStatus(classTermId, subjectId, termId),
      "get assessment status",
    )
    expect(assessments.assessments.map((row) => row.studentId)).toEqual([
      activeStudentId,
      completedStudentId,
    ])
    expect(assessments.statistics.totalStudents).toBe(2)
    expect(assessments.statistics.completeAssessments).toBe(2)

    const classResults = ok(await getClassTermResults(classTermId), "get class results")
    expect(classResults.map((row) => row.studentId)).toEqual([activeStudentId, completedStudentId])
    expect(classResults.find((row) => row.studentId === activeStudentId)?.position).toBe(1)
    expect(classResults.find((row) => row.studentId === completedStudentId)?.position).toBe(2)

    const completedReport = ok(
      await getStudentReportData(completedStudentId, termId),
      "get completed student report",
    )
    expect(completedReport.studentId).toBe(completedStudentId)
    expect(completedReport.totalScore).toBe(64)

    const stats = ok(await getClassStatistics(classTermId), "get class statistics")
    expect(stats.classAverage).toBe(74.5)

    const publish = await publishClassTermResults(classTermId)
    expect(publish.success, publish.success ? "" : publish.error).toBe(true)

    const publishedRows = await prisma.assessment.findMany({
      where: { studentClassTermId: { in: [activeStudentClassTermId, completedStudentClassTermId, droppedStudentClassTermId] } },
      select: { studentClassTermId: true, isPublished: true },
    })
    expect(publishedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentClassTermId: activeStudentClassTermId, isPublished: true }),
        expect.objectContaining({ studentClassTermId: completedStudentClassTermId, isPublished: true }),
        expect.objectContaining({ studentClassTermId: droppedStudentClassTermId, isPublished: false }),
      ]),
    )

    const unpublish = await unpublishClassTermResults(classTermId, "Compiler integration correction")
    expect(unpublish.success, unpublish.success ? "" : unpublish.error).toBe(true)

    const withdrawnRows = await prisma.assessment.findMany({
      where: { studentClassTermId: { in: [activeStudentClassTermId, completedStudentClassTermId, droppedStudentClassTermId] } },
      select: { studentClassTermId: true, isPublished: true },
    })
    expect(withdrawnRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentClassTermId: activeStudentClassTermId, isPublished: false }),
        expect.objectContaining({ studentClassTermId: completedStudentClassTermId, isPublished: false }),
        expect.objectContaining({ studentClassTermId: droppedStudentClassTermId, isPublished: false }),
      ]),
    )
  })

  it("refuses a teacher score payload whose student and enrollment do not match", async () => {
    actAsTeacher()

    const result = await saveTeacherAssessments(
      [
        {
          studentId: activeStudentId,
          studentClassTermId: completedStudentClassTermId,
          subjectId,
          termId,
          ca1: 7,
          ca2: 7,
          ca3: 7,
          exam: 50,
        },
        {
          studentId: completedStudentId,
          studentClassTermId: activeStudentClassTermId,
          subjectId,
          termId,
          ca1: 7,
          ca2: 7,
          ca3: 7,
          exam: 50,
        },
      ],
      termId,
      subjectId,
      classTermId,
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not linked to enrollment|do not belong to this class term/i)

    // Refusing has to mean nothing was written.
    const written = await prisma.assessment.findFirst({
      where: { studentId: activeStudentId, studentClassTermId: completedStudentClassTermId },
      select: { id: true },
    })
    expect(written, "the payload was refused but a row was still written").toBeNull()
  })
})
