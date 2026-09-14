import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Deleting a class or a subject, and what goes with it.
 *
 * Both sit at the top of a cascade chain that ends at student results:
 *
 *   Class → ClassTerm → StudentClassTerm → Assessment      (every link CASCADE)
 *   Subject → Assessment                                    (CASCADE)
 *
 * Deleting a class also cascades StudentEnrollmentHistory, StudentTransition (both ends) and
 * FeeStructure/FeeSchedule, so a single click could take enrolment history, promotion
 * history, billing configuration and every score any student ever earned in that class.
 *
 * `deleteClass` had no guard at all. `deleteSubject` guarded on `classSubjects` — the
 * *current* curriculum — which says nothing about results already recorded: a subject
 * dropped from the timetable has no classSubjects and years of marks.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { deleteClass } = await import("@/app/actions/class-management")
const { deleteSubject } = await import("@/app/actions/subject-management")

const STAMP = "ZZStructureDeletes"

const created = {
  userIds: [] as string[],
  studentIds: [] as string[],
  classIds: [] as string[],
  subjectIds: [] as string[],
}

let schoolId = ""
let termId = ""
let studentId = ""

/** Carries an enrolled student with a recorded score. */
let loadedClassId = ""
let loadedClassTermId = ""

/** Carries a recorded score. */
let scoredSubjectId = ""
let assessmentId = ""

/** Nothing attached — deleting these must still work. */
let emptyClassId = ""
let emptySubjectId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  schoolId = admin.admin.schoolId

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  const term = await prisma.term.findFirst({
    where: { session: { schoolId } },
    orderBy: { startDate: "desc" },
    select: { id: true },
  })
  if (!term) throw new Error("The school has no term")
  termId = term.id

  const loadedClass = await prisma.class.create({
    data: { schoolId, name: `${STAMP} Loaded Class`, level: "JSS" },
    select: { id: true },
  })
  loadedClassId = loadedClass.id
  created.classIds.push(loadedClass.id)

  const classTerm = await prisma.classTerm.create({
    data: { classId: loadedClass.id, termId },
    select: { id: true },
  })
  loadedClassTermId = classTerm.id

  const emptyClass = await prisma.class.create({
    data: { schoolId, name: `${STAMP} Empty Class`, level: "JSS" },
    select: { id: true },
  })
  emptyClassId = emptyClass.id
  created.classIds.push(emptyClass.id)

  const scoredSubject = await prisma.subject.create({
    data: { schoolId, name: `${STAMP} Scored`, code: `${STAMP}-SCR` },
    select: { id: true },
  })
  scoredSubjectId = scoredSubject.id
  created.subjectIds.push(scoredSubject.id)

  const emptySubject = await prisma.subject.create({
    data: { schoolId, name: `${STAMP} Unused`, code: `${STAMP}-UNU` },
    select: { id: true },
  })
  emptySubjectId = emptySubject.id
  created.subjectIds.push(emptySubject.id)

  const studentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Pupil", role: "STUDENT" },
    select: { id: true },
  })
  created.userIds.push(studentUser.id)

  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      schoolId,
      admissionNo: `${STAMP}-${Date.now()}`,
      year: 2024,
    },
    select: { id: true },
  })
  studentId = student.id
  created.studentIds.push(student.id)

  const sct = await prisma.studentClassTerm.create({
    data: { studentId: student.id, classTermId: classTerm.id, termId, status: "ACTIVE" },
    select: { id: true },
  })

  const assessment = await prisma.assessment.create({
    data: {
      studentId: student.id,
      subjectId: scoredSubject.id,
      termId,
      studentClassTermId: sct.id,
      ca1: 12,
      ca2: 13,
      ca3: 14,
      exam: 51,
      editedBy: admin.id,
      createdBy: admin.id,
    },
    select: { id: true },
  })
  assessmentId = assessment.id

  // Deliberately NOT creating a ClassSubject for the scored subject. That is the real
  // shape of the gap: a subject dropped from the curriculum still holds its results, and
  // the old guard only looked at the current curriculum.
})

afterAll(async () => {
  await prisma.assessment.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.studentClassTerm.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  await prisma.classTerm.deleteMany({ where: { classId: { in: created.classIds } } })
  await prisma.class.deleteMany({ where: { id: { in: created.classIds } } })
  await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has a student enrolled in the class with a recorded score", async () => {
    const enrolment = await prisma.studentClassTerm.findFirst({
      where: { classTermId: loadedClassTermId },
      select: { id: true },
    })
    expect(enrolment, "no enrolment in the fixture").not.toBeNull()

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { subjectId: true },
    })
    expect(assessment, "no assessment in the fixture").not.toBeNull()
    expect(assessment?.subjectId).toBe(scoredSubjectId)
  })

  it("has a scored subject that is NOT on any current class timetable", async () => {
    // If a ClassSubject existed, deleteSubject's old guard would have refused for the
    // wrong reason and the test would prove nothing about results.
    const link = await prisma.classSubject.findFirst({
      where: { subjectId: scoredSubjectId },
      select: { id: true },
    })
    expect(link, "the scored subject is on a timetable — the gap would be masked").toBeNull()
  })
})

describe("deleting a class", () => {
  it("refuses while students are enrolled, and keeps their results", async () => {
    await expect(
      deleteClass(loadedClassId),
      "a class with enrolled students was deleted",
    ).rejects.toThrow()

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } })
    expect(assessment, "student results were destroyed with the class").not.toBeNull()

    const enrolment = await prisma.studentClassTerm.findFirst({
      where: { classTermId: loadedClassTermId },
      select: { id: true },
    })
    expect(enrolment, "the enrolment was destroyed with the class").not.toBeNull()
  })

  it("still deletes a class nothing is attached to", async () => {
    await expect(deleteClass(emptyClassId)).resolves.toEqual({ success: true })

    const gone = await prisma.class.findUnique({ where: { id: emptyClassId } })
    expect(gone, "an empty class should be deletable").toBeNull()
  })
})

describe("deleting a subject", () => {
  it("refuses while results exist for it, even with no class assignment", async () => {
    await expect(
      deleteSubject(scoredSubjectId),
      "a subject holding student results was deleted",
    ).rejects.toThrow()

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } })
    expect(assessment, "student results were destroyed with the subject").not.toBeNull()
  })

  it("still deletes a subject nothing is attached to", async () => {
    await expect(deleteSubject(emptySubjectId)).resolves.toEqual({ success: true })

    const gone = await prisma.subject.findUnique({ where: { id: emptySubjectId } })
    expect(gone, "an unused subject should be deletable").toBeNull()
  })
})
