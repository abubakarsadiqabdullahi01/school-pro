import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The teacher lifecycle, and the two places it touches data that is not the teacher's own.
 *
 * A teacher is not a leaf record. Scores they entered belong to the *student*; the payroll
 * record they are attached to belongs to *HR*. Deleting a teacher must not reach into either.
 *
 * `Assessment.teacherId` is nullable and the schema comment calls it "a plain attribute
 * recording who entered the score" — but the relation carries `onDelete: Cascade`, so the
 * database treats the teacher as the score's owner. Deleting a teacher takes every score
 * they ever entered with them, for every student, every subject, every term.
 *
 * The second hole is narrower: the subject-assignment actions check that the teacher and the
 * subject belong to the admin's school, then check the term with `if (!term)` — existence,
 * not ownership. Two ids validated out of three.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { deleteTeacher } = await import("@/app/actions/teacher-management")
const { assignTeacherToSubject } = await import("@/app/actions/teacher-assignment")

const STAMP = "ZZTeacherLifecycle"

const created = {
  teacherIds: [] as string[],
  userIds: [] as string[],
  studentIds: [] as string[],
  subjectIds: [] as string[],
  staffIds: [] as string[],
  foreignSessionId: "",
  foreignTermId: "",
}

let schoolId = ""
let otherSchoolId = ""
let subjectId = ""
let termId = ""
let studentClassTermId = ""
let studentId = ""
let adminUserId = ""

/** The teacher who has entered scores — deleting them must not touch the scores. */
let scoringTeacherId = ""
let scoringTeacherUserId = ""
let assessmentId = ""

/** A teacher with no records at all — deleting them should genuinely delete. */
let cleanTeacherId = ""
let cleanTeacherUserId = ""

/** A teacher kept alive for the assignment tests — never deleted. */
let assignTeacherId = ""

/** A teacher who is also on payroll. */
let payrolledTeacherId = ""
let payrolledTeacherUserId = ""
let payrolledStaffId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  schoolId = admin.admin.schoolId
  adminUserId = admin.id

  // teacher-management reads the role off the session. A mock without it is rejected as
  // Unauthorized before any of the logic under test runs, which would turn every assertion
  // below into a pass for the wrong reason.
  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  const term = await prisma.term.findFirst({
    where: { session: { schoolId } },
    orderBy: { startDate: "desc" },
    select: { id: true },
  })
  if (!term) throw new Error("The admin's school has no term")
  termId = term.id

  const classTerm = await prisma.classTerm.findFirst({
    where: { termId, class: { schoolId } },
    select: { id: true },
  })
  if (!classTerm) throw new Error("The admin's school has no class term")

  const subject = await prisma.subject.create({
    data: { schoolId, name: `${STAMP} Subject`, code: `${STAMP}-SUB` },
    select: { id: true },
  })
  subjectId = subject.id
  created.subjectIds.push(subject.id)

  // A student to hang the score on, created here rather than borrowed, so the assertion
  // about the score surviving is about this test's own data.
  const studentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Student", role: "STUDENT" },
    select: { id: true },
  })
  created.userIds.push(studentUser.id)
  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      schoolId,
      admissionNo: `${STAMP}-STU-${Date.now()}`,
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
  studentClassTermId = sct.id

  // Teacher 1: enters a score.
  const scoringUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Scorer", role: "TEACHER" },
    select: { id: true },
  })
  scoringTeacherUserId = scoringUser.id
  created.userIds.push(scoringUser.id)
  const scoringTeacher = await prisma.teacher.create({
    data: { userId: scoringUser.id, schoolId, staffId: `${STAMP}-T1-${Date.now()}` },
    select: { id: true },
  })
  scoringTeacherId = scoringTeacher.id
  created.teacherIds.push(scoringTeacher.id)

  const assessment = await prisma.assessment.create({
    data: {
      studentId: student.id,
      subjectId,
      termId,
      studentClassTermId: sct.id,
      teacherId: scoringTeacher.id,
      ca1: 15,
      exam: 55,
      editedBy: adminUserId,
      createdBy: adminUserId,
    },
    select: { id: true },
  })
  assessmentId = assessment.id

  // Teacher 2: no records of any kind.
  const cleanUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Clean", role: "TEACHER" },
    select: { id: true },
  })
  cleanTeacherUserId = cleanUser.id
  created.userIds.push(cleanUser.id)
  const cleanTeacher = await prisma.teacher.create({
    data: { userId: cleanUser.id, schoolId, staffId: `${STAMP}-T2-${Date.now()}` },
    select: { id: true },
  })
  cleanTeacherId = cleanTeacher.id
  created.teacherIds.push(cleanTeacher.id)

  // Teacher 3: exists only to be assigned. Deleting a teacher in an earlier test and then
  // reusing them here made assignTeacherToSubject fail with "Teacher not found" — the
  // boundary assertion passed without the term check ever running.
  const assignUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Assignee", role: "TEACHER" },
    select: { id: true },
  })
  created.userIds.push(assignUser.id)
  const assignTeacher = await prisma.teacher.create({
    data: { userId: assignUser.id, schoolId, staffId: `${STAMP}-T4-${Date.now()}` },
    select: { id: true },
  })
  assignTeacherId = assignTeacher.id
  created.teacherIds.push(assignTeacher.id)

  // Teacher 4: the same human also exists in HR as a staff member on the payroll.
  const payrolledUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Payrolled", role: "TEACHER" },
    select: { id: true },
  })
  payrolledTeacherUserId = payrolledUser.id
  created.userIds.push(payrolledUser.id)
  const payrolledTeacher = await prisma.teacher.create({
    data: { userId: payrolledUser.id, schoolId, staffId: `${STAMP}-T3-${Date.now()}` },
    select: { id: true },
  })
  payrolledTeacherId = payrolledTeacher.id
  created.teacherIds.push(payrolledTeacher.id)

  const staff = await prisma.staff.create({
    data: {
      schoolId,
      userId: payrolledUser.id,
      staffNo: `${STAMP}-S3-${Date.now()}`,
      firstName: STAMP,
      lastName: "Payrolled",
      employmentType: "FULL_TIME",
      employmentStatus: "ACTIVE",
      staffType: "TEACHER",
      dateEmployed: new Date("2024-01-01"),
    },
    select: { id: true },
  })
  payrolledStaffId = staff.id
  created.staffIds.push(staff.id)

  // A term in the other school, created rather than hoped for: a seeded second school may
  // have no sessions, and an absent fixture would make the tenancy assertion vacuous.
  const other = await prisma.school.findFirst({ where: { id: { not: schoolId } }, select: { id: true } })
  if (!other) throw new Error("Need a second school to test the tenancy boundary")
  otherSchoolId = other.id

  const foreignSession = await prisma.session.create({
    data: {
      schoolId: otherSchoolId,
      name: `${STAMP} Foreign Session`,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-07-31"),
    },
    select: { id: true },
  })
  created.foreignSessionId = foreignSession.id
  const foreignTerm = await prisma.term.create({
    data: {
      sessionId: foreignSession.id,
      name: `${STAMP} Foreign Term`,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2024-12-15"),
    },
    select: { id: true },
  })
  created.foreignTermId = foreignTerm.id
})

afterAll(async () => {
  await prisma.assessment.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.teacherSubject.deleteMany({ where: { teacherId: { in: created.teacherIds } } })
  await prisma.teacherClassTerm.deleteMany({ where: { teacherId: { in: created.teacherIds } } })
  await prisma.staff.deleteMany({ where: { id: { in: created.staffIds } } })
  await prisma.studentClassTerm.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  await prisma.teacher.deleteMany({ where: { id: { in: created.teacherIds } } })
  await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } })
  if (created.foreignTermId) await prisma.term.deleteMany({ where: { id: created.foreignTermId } })
  if (created.foreignSessionId) await prisma.session.deleteMany({ where: { id: created.foreignSessionId } })
  await prisma.credential.deleteMany({ where: { userId: { in: created.userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has a score entered by the teacher we are about to delete", async () => {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { teacherId: true, studentId: true },
    })
    expect(assessment, "the fixture assessment was not created").not.toBeNull()
    expect(assessment?.teacherId, "the score is not linked to the scoring teacher").toBe(scoringTeacherId)
    expect(assessment?.studentId).toBe(studentId)
  })

  it("has a foreign term that genuinely belongs to the other school", async () => {
    const term = await prisma.term.findUnique({
      where: { id: created.foreignTermId },
      select: { session: { select: { schoolId: true } } },
    })
    expect(term, "the foreign term was not created").not.toBeNull()
    expect(term?.session.schoolId, "the foreign term is not in the other school").toBe(otherSchoolId)
    expect(otherSchoolId).not.toBe(schoolId)
  })
})

describe("deleting a teacher does not delete student results", () => {
  it("keeps the scores when the teacher who entered them is removed", async () => {
    const result = await deleteTeacher(scoringTeacherId)
    expect(result.success, `deleteTeacher failed: ${"error" in result ? result.error : ""}`).toBe(true)

    // The score belongs to the student, not to the teacher. Whether the teacher record is
    // archived or removed, the mark must still be there.
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, ca1: true, exam: true },
    })
    expect(assessment, "the student's score was destroyed with the teacher").not.toBeNull()
    expect(assessment?.ca1).toBe(15)
    expect(assessment?.exam).toBe(55)
  })

  it("archives the teacher instead, and says so", async () => {
    // The teacher above was archived by the previous test. Archiving that nothing can see
    // is the same as doing nothing: the list reads `user.isActive`, so it has to be false.
    const teacher = await prisma.teacher.findUnique({
      where: { id: scoringTeacherId },
      select: { user: { select: { isActive: true } } },
    })
    expect(teacher, "the teacher record was removed rather than archived").not.toBeNull()
    expect(teacher?.user.isActive, "archived but still shown as active").toBe(false)
  })

  it("still removes a teacher who has no records", async () => {
    const result = await deleteTeacher(cleanTeacherId)
    expect(result.success).toBe(true)

    const teacher = await prisma.teacher.findUnique({ where: { id: cleanTeacherId } })
    expect(teacher, "a teacher with no records should be genuinely deleted").toBeNull()
    const user = await prisma.user.findUnique({ where: { id: cleanTeacherUserId } })
    expect(user, "the login should go with them").toBeNull()
  })
})

describe("deleting a teacher does not corrupt the payroll", () => {
  it("does not leave a staff record silently detached from its login", async () => {
    await deleteTeacher(payrolledTeacherId)

    const staff = await prisma.staff.findUnique({
      where: { id: payrolledStaffId },
      select: { userId: true, employmentStatus: true },
    })
    expect(staff, "the staff record vanished from HR").not.toBeNull()

    // Staff.user is onDelete: SetNull. If the teacher's User row is deleted, the staff
    // member stays on the payroll with their name and salary intact but no login and no
    // way to tell they ever had one. Either the teacher is archived and the link holds, or
    // HR is told the person has left — a silent null is neither.
    if (staff?.userId === null) {
      expect(
        staff.employmentStatus,
        "the staff record was orphaned from its login but left ACTIVE on the payroll",
      ).not.toBe("ACTIVE")
    }
  })
})

describe("subject assignment respects the school boundary", () => {
  it("refuses a term that belongs to another school", async () => {
    const result = await assignTeacherToSubject({
      teacherId: assignTeacherId,
      subjectId,
      termId: created.foreignTermId,
    })

    expect(result.success, "a term from another school was accepted").toBe(false)

    // The refusal has to be about the boundary. "Teacher not found" or "Subject not found"
    // would mean the call died before reaching the term at all.
    const message = "error" in result ? String(result.error) : ""
    expect(message.toLowerCase(), `refused for the wrong reason: ${message}`).not.toContain("teacher not found")
    expect(message.toLowerCase(), `refused for the wrong reason: ${message}`).not.toContain("subject not found")

    const leaked = await prisma.teacherSubject.findFirst({
      where: { subjectId, termId: created.foreignTermId },
      select: { id: true },
    })
    expect(leaked, "a cross-school assignment row was written").toBeNull()
  })
})
