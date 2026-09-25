import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The student lifecycle: creation, the record itself, and the tenancy boundary around it.
 *
 * The boundary is the part worth testing hardest. `createStudent` takes a class, a term and
 * a parent as ids from the caller, and the rule this codebase states in lib/authz.ts is that
 * school scope comes from the session and never from a parameter. If a related id is trusted
 * without checking who owns it, one school can write into another's data — and nothing
 * about that failure is visible from the outside.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {},
  // `lib/authz` reaches session expiry, which caches the school's idle limits.
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const {
  createParent,
  createStudent,
  deleteStudent,
  getStudent,
  getStudents,
  searchParents,
  toggleStudentStatus,
  updateStudent,
} = await import("@/app/actions/student-management")
const { createFeeSchedule } = await import("@/app/actions/finance")

const STAMP = "ZZLifecycle"

const created = {
  studentIds: [] as string[],
  userIds: [] as string[],
  // Built in the other school so the tenancy assertions have something real to push against.
  foreignClassId: "",
  foreignParentUserId: "",
  foreignParentId: "",
  foreignStudentId: "",
  foreignStudentUserId: "",
  parentIds: [] as string[],
  parentUserIds: [] as string[],
}

let schoolId = ""
let adminUserId = ""
let otherSchoolId = ""
let classId = ""
let termId = ""
let foreignClassId = ""
let foreignParentId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  schoolId = admin.admin.schoolId
  adminUserId = admin.id

  // The role travels in the session, and student-management reads it from there — a mock
  // without it is rejected before any tenancy check runs, which would make the assertions
  // below pass for the wrong reason.
  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  const ownClass = await prisma.class.findFirst({ where: { schoolId }, select: { id: true } })
  const ownTerm = await prisma.term.findFirst({
    where: { session: { schoolId } },
    orderBy: { startDate: "desc" },
    select: { id: true },
  })
  if (!ownClass || !ownTerm) throw new Error("The admin's school has no class or term")
  classId = ownClass.id
  termId = ownTerm.id

  // A second school is what makes the tenancy assertions meaningful. The other school in a
  // seeded database may have no classes or parents, in which case an early return would let
  // these tests pass without ever calling the code — so the fixtures are created here rather
  // than hoped for.
  const other = await prisma.school.findFirst({ where: { id: { not: schoolId } }, select: { id: true } })
  if (!other) throw new Error("Need a second school to test the tenancy boundary")
  otherSchoolId = other.id

  const otherClass = await prisma.class.create({
    data: { schoolId: otherSchoolId, name: `${STAMP} Foreign Class`, level: "JSS" },
    select: { id: true },
  })
  created.foreignClassId = otherClass.id
  foreignClassId = otherClass.id

  const parentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "ForeignParent", role: "PARENT" },
    select: { id: true },
  })
  created.foreignParentUserId = parentUser.id
  const parent = await prisma.parent.create({
    data: { userId: parentUser.id, schoolId: otherSchoolId },
    select: { id: true },
  })
  created.foreignParentId = parent.id
  foreignParentId = parent.id

  const foreignStudentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "ForeignStudent", role: "STUDENT" },
    select: { id: true },
  })
  created.foreignStudentUserId = foreignStudentUser.id
  const foreignStudent = await prisma.student.create({
    data: {
      userId: foreignStudentUser.id,
      schoolId: otherSchoolId,
      admissionNo: `${STAMP}-FOREIGN-${Date.now()}`,
      year: 2019,
    },
    select: { id: true },
  })
  created.foreignStudentId = foreignStudent.id
})

afterAll(async () => {
  if (created.studentIds.length > 0) {
    await prisma.studentEnrollmentHistory.deleteMany({ where: { studentId: { in: created.studentIds } } })
    await prisma.studentClassTerm.deleteMany({ where: { studentId: { in: created.studentIds } } })
    await prisma.studentParent.deleteMany({ where: { studentId: { in: created.studentIds } } })
    await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  }
  if (created.userIds.length > 0) {
    await prisma.credential.deleteMany({ where: { userId: { in: created.userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  }

  // Anything the tests created under the stamp, including a student a failing assertion let
  // through before the fix landed.
  const strays = await prisma.student.findMany({
    where: { user: { firstName: STAMP } },
    select: { id: true, userId: true },
  })
  if (strays.length > 0) {
    const ids = strays.map((row) => row.id)
    await prisma.studentEnrollmentHistory.deleteMany({ where: { studentId: { in: ids } } })
    await prisma.studentClassTerm.deleteMany({ where: { studentId: { in: ids } } })
    await prisma.studentParent.deleteMany({ where: { studentId: { in: ids } } })
    await prisma.student.deleteMany({ where: { id: { in: ids } } })
    await prisma.credential.deleteMany({ where: { userId: { in: strays.map((row) => row.userId) } } })
    await prisma.user.deleteMany({ where: { id: { in: strays.map((row) => row.userId) } } })
  }

  if (created.foreignStudentId) await prisma.student.deleteMany({ where: { id: created.foreignStudentId } })
  if (created.foreignStudentUserId) await prisma.user.deleteMany({ where: { id: created.foreignStudentUserId } })
  if (created.parentIds.length > 0) {
    await prisma.studentParent.deleteMany({ where: { parentId: { in: created.parentIds } } })
    await prisma.parent.deleteMany({ where: { id: { in: created.parentIds } } })
  }
  if (created.parentUserIds.length > 0) {
    await prisma.credential.deleteMany({ where: { userId: { in: created.parentUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: created.parentUserIds } } })
  }
  if (created.foreignParentId) await prisma.parent.deleteMany({ where: { id: created.foreignParentId } })
  if (created.foreignParentUserId) await prisma.user.deleteMany({ where: { id: created.foreignParentUserId } })
  if (created.foreignClassId) {
    await prisma.classTerm.deleteMany({ where: { classId: created.foreignClassId } })
    await prisma.class.deleteMany({ where: { id: created.foreignClassId } })
  }

  await prisma.$disconnect()
})

/** Records whatever was created so the teardown can find it, whether or not the call passed. */
async function track(admissionNo: string) {
  const student = await prisma.student.findFirst({
    where: { admissionNo },
    select: { id: true, userId: true },
  })
  if (student) {
    created.studentIds.push(student.id)
    created.userIds.push(student.userId)
  }
  return student
}

describe("creating a student", () => {
  it("issues an admission number and enrols them in the chosen class", async () => {
    const result = await createStudent({
      firstName: STAMP,
      lastName: "Alpha",
      dateOfBirth: "2012-04-01",
      year: 2019,
      classId,
      termId,
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)

    const admissionNo = (result as { data?: { admissionNo?: string } }).data?.admissionNo
    expect(admissionNo, "an admission number should come back").toBeTruthy()

    const student = await track(admissionNo!)
    expect(student).toBeTruthy()

    // Enrolled, active, and with an enrolment history entry — the three things that make a
    // student real to the rest of the system.
    const enrolment = await prisma.studentClassTerm.findFirst({
      where: { studentId: student!.id },
      select: { status: true, termId: true },
    })
    expect(enrolment?.status).toBe("ACTIVE")
    expect(enrolment?.termId).toBe(termId)

    const history = await prisma.studentEnrollmentHistory.findFirst({
      where: { studentId: student!.id },
      select: { action: true },
    })
    expect(history?.action).toBe("ENROLLED")
  })

  it("puts the student in the acting admin's school, not one supplied by the caller", async () => {
    const student = await prisma.student.findFirst({
      where: { id: { in: created.studentIds } },
      select: { schoolId: true },
    })
    expect(student?.schoolId).toBe(schoolId)
  })
})

describe("the tenancy boundary", () => {
  it("has a genuine second school to push against", () => {
    // Guards the three assertions below. An early return on a missing fixture would let them
    // all pass without calling the code once.
    expect(otherSchoolId).toBeTruthy()
    expect(foreignClassId).toBeTruthy()
    expect(foreignParentId).toBeTruthy()
  })

  it("refuses a class belonging to another school", async () => {
    const result = await createStudent({
      firstName: STAMP,
      lastName: "ForeignClass",
      dateOfBirth: "2012-04-01",
      year: 2019,
      classId: foreignClassId,
      termId,
    })

    // Enrolling into another school's class would also create a ClassTerm inside their data.
    expect(result.success, "a student was enrolled into another school's class").toBe(false)
  })

  it("refuses a parent belonging to another school", async () => {
    const result = await createStudent({
      firstName: STAMP,
      lastName: "ForeignParent",
      dateOfBirth: "2012-04-01",
      year: 2019,
      classId,
      termId,
      parentId: foreignParentId,
    })

    // A parent linked across schools would see another school's child on their dashboard.
    expect(result.success, "a student was linked to another school's parent").toBe(false)
  })

  it("refuses a term belonging to another school", async () => {
    const foreignTerm = await prisma.term.findFirst({
      where: { session: { schoolId: otherSchoolId } },
      select: { id: true },
    })
    expect(foreignTerm, "the other school needs a term for this to mean anything").toBeTruthy()

    const result = await createStudent({
      firstName: STAMP,
      lastName: "ForeignTerm",
      dateOfBirth: "2012-04-01",
      year: 2019,
      classId,
      termId: foreignTerm!.id,
    })
    expect(result.success, "a student was enrolled into another school's term").toBe(false)
  })
})

/** Creates a throwaway student in the acting admin's school and tracks it for teardown. */
async function makeStudent(lastName: string) {
  const result = await createStudent({
    firstName: STAMP,
    lastName,
    dateOfBirth: "2012-04-01",
    year: 2019,
    classId,
    termId,
  })
  if (!result.success) throw new Error(`createStudent failed: ${result.error}`)
  const admissionNo = (result as { data?: { admissionNo?: string } }).data?.admissionNo
  const student = await track(admissionNo!)
  if (!student) throw new Error("student not found after creation")
  return student
}

describe("changing a student's class from the edit form", () => {
  it("refuses a class term belonging to another school", async () => {
    const student = await makeStudent("ClassChange")

    // Give the other school a real class term to aim at, so this is not a vacuous test.
    const foreignTerm = await prisma.term.findFirst({
      where: { session: { schoolId: otherSchoolId } },
      select: { id: true },
    })
    expect(foreignTerm, "the other school needs a term for this to mean anything").toBeTruthy()

    if (!foreignTerm) throw new Error("the other school has no term")
    const foreignClassTerm = await prisma.classTerm.create({
      data: { classId: foreignClassId, termId: foreignTerm.id },
      select: { id: true },
    })

    const result = await updateStudent({
      studentId: student.id,
      data: { classId: foreignClassId, termId: foreignTerm!.id },
    })

    const landed = await prisma.studentClassTerm.findFirst({
      where: { studentId: student.id, classTermId: foreignClassTerm.id },
      select: { id: true },
    })
    expect(landed, "a student was moved into another school's class term").toBeNull()
    expect(result.success).toBe(false)
  })

  it("says so when the class and term have no class term, rather than silently doing nothing", async () => {
    const student = await makeStudent("NoClassTerm")

    // A term in this school that the chosen class was never opened for.
    const otherTerm = await prisma.term.findFirst({
      where: { session: { schoolId }, id: { not: termId } },
      select: { id: true },
    })
    expect(otherTerm, "the school needs a second term for this case").toBeTruthy()

    const existing = await prisma.classTerm.findFirst({
      where: { classId, termId: otherTerm!.id },
      select: { id: true },
    })
    if (existing) return // Already open; this case cannot be exercised on this data.

    const before = await prisma.studentClassTerm.findFirst({
      where: { studentId: student.id },
      select: { classTermId: true },
    })

    const result = await updateStudent({
      studentId: student.id,
      data: { classId, termId: otherTerm!.id },
    })

    const after = await prisma.studentClassTerm.findFirst({
      where: { studentId: student.id, status: "ACTIVE" },
      select: { classTermId: true },
    })

    // Either it opens the class term and moves them, or it refuses. What it must not do is
    // report success while leaving the student exactly where they were — the admin walks
    // away believing the class changed.
    const moved = after?.classTermId !== before?.classTermId
    expect(result.success === false || moved, "reported success but the class did not change").toBe(true)
  })
})

describe("deleting a student", () => {
  it("does not destroy money owed", async () => {
    const student = await makeStudent("Owing")

    // Bill them, without any payment. deleteStudent guards on assessments and payments, so
    // an unpaid charge is the case that decides whether debt can be deleted.
    const schedule = await prisma.feeSchedule.findFirst({
      where: { schoolId },
      select: { id: true, sessionId: true, termId: true, classTermId: true },
    })
    if (!schedule) return // No fee schedule on this data; nothing to bill against.

    const charge = await prisma.studentCharge.create({
      data: {
        schoolId,
        studentId: student.id,
        sessionId: schedule.sessionId,
        termId: schedule.termId,
        classTermId: schedule.classTermId,
        feeScheduleId: schedule.id,
        originalAmount: 25_000,
        finalAmountDue: 25_000,
        balance: 25_000,
      },
      select: { id: true },
    })

    await deleteStudent(student.id)

    // StudentCharge cascades on student delete, so a hard delete takes the debt with it —
    // and the debtors report and accumulated fund quietly drop by that amount.
    const survived = await prisma.studentCharge.findUnique({ where: { id: charge.id } })
    expect(survived, "an outstanding charge was destroyed with the student").not.toBeNull()

    if (survived) await prisma.studentCharge.deleteMany({ where: { id: charge.id } })
  })

  it("does not mangle the home state when archiving", async () => {
    const student = await makeStudent("Archived")
    await prisma.user.update({ where: { id: student.userId }, data: { state: "Kano" } })

    // Give them an assessment so the archive path is taken rather than the hard delete.
    const classTerm = await prisma.studentClassTerm.findFirst({
      where: { studentId: student.id },
      select: { id: true, termId: true },
    })
    const subject = await prisma.subject.findFirst({ where: { schoolId }, select: { id: true } })
    if (!classTerm || !subject) return

    await prisma.assessment.create({
      data: {
        studentId: student.id,
        studentClassTermId: classTerm.id,
        subjectId: subject.id,
        termId: classTerm.termId,
        ca1: 10,
        editedBy: adminUserId,
        createdBy: adminUserId,
      },
    })

    await deleteStudent(student.id)

    const user = await prisma.user.findUnique({
      where: { id: student.userId },
      select: { state: true, isActive: true },
    })
    // Status belongs in isActive, not smuggled into a field that holds where they are from.
    expect(user?.isActive).toBe(false)
    expect(user?.state, "the archive flag was written into the home state").toBe("Kano")
  })
})

describe("deactivating a student", () => {
  it("stops them being billed", async () => {
    const student = await makeStudent("Deactivated")
    await toggleStudentStatus(student.id)

    const user = await prisma.user.findUnique({ where: { id: student.userId }, select: { isActive: true } })
    expect(user?.isActive).toBe(false)

    // The requirement is about money, not about a status column: a deactivated student must
    // not appear on the next fee run. Their enrolment row legitimately stays ACTIVE — they
    // are still in the class list — so the billing query is what has to know.
    const category = await prisma.feeCategory.create({
      data: { schoolId, name: `${STAMP} Billing Check ${Date.now()}` },
      select: { id: true },
    })
    const enrolment = await prisma.studentClassTerm.findFirst({
      where: { studentId: student.id },
      select: { classTermId: true, classTerm: { select: { term: { select: { id: true, sessionId: true } } } } },
    })
    expect(enrolment, "the student should still be enrolled").toBeTruthy()

    const schedule = await createFeeSchedule({
      sessionId: enrolment!.classTerm.term.sessionId,
      termId: enrolment!.classTerm.term.id,
      classTermId: enrolment!.classTermId,
      categoryId: category.id,
      name: `${STAMP} Billing Check`,
      amount: 1000,
    })
    expect(schedule.success, schedule.success ? "" : schedule.error).toBe(true)

    const charged = await prisma.studentCharge.findFirst({
      where: { studentId: student.id },
      select: { id: true },
    })
    expect(charged, "a deactivated student was billed").toBeNull()

    // Tidy up the schedule and every charge it raised for the rest of the class.
    if (schedule.success) {
      await prisma.studentCharge.deleteMany({ where: { feeScheduleId: schedule.data.id } })
      await prisma.feeSchedule.deleteMany({ where: { id: schedule.data.id } })
    }
    await prisma.feeCategory.deleteMany({ where: { id: category.id } })
  })
})

describe("reading across the school boundary", () => {
  it("refuses to open another school's student", async () => {
    expect(created.foreignStudentId, "the fixture student should exist").toBeTruthy()

    const result = await getStudent({ studentId: created.foreignStudentId })
    // A record fetched by id and then checked is fine; returning it would not be.
    expect(result.success).toBe(false)
  })

  it("does not list another school's students", async () => {
    const result = await getStudents({ page: 1, pageSize: 200 })
    expect(result.success).toBe(true)

    const rows = (result as { data?: { students?: Array<{ id: string }> } }).data?.students ?? []
    expect(rows.some((row) => row.id === created.foreignStudentId)).toBe(false)
  })

  it("does not surface another school's parents in the picker", async () => {
    // The parent picker feeds the create form, so a leak here would let an admin attach a
    // parent they should never have seen in the first place.
    const result = await searchParents(STAMP)
    expect(result.success).toBe(true)

    const rows = (result as { data?: Array<{ id: string }> }).data ?? []
    expect(rows.some((row) => row.id === created.foreignParentId)).toBe(false)
  })
})

describe("creating a parent", () => {
  it("puts them in the acting admin's school", async () => {
    const result = await createParent({
      firstName: STAMP,
      lastName: "NewParent",
      phone: "08000000000",
      occupation: "Trader",
    })
    expect(result.success, result.success ? "" : (result as { error?: string }).error).toBe(true)

    const parentId = (result as { data?: { id?: string } }).data?.id
    expect(parentId).toBeTruthy()

    const parent = await prisma.parent.findUnique({
      where: { id: parentId! },
      select: { schoolId: true, userId: true },
    })
    expect(parent?.schoolId).toBe(schoolId)

    created.parentIds.push(parentId!)
    if (parent?.userId) created.parentUserIds.push(parent.userId)
  })

  it("reports a duplicate email in words rather than raising a database error", async () => {
    const email = `${STAMP.toLowerCase()}.dup.${Date.now()}@example.test`

    const first = await createParent({ firstName: STAMP, lastName: "DupOne", email })
    expect(first.success, first.success ? "" : (first as { error?: string }).error).toBe(true)
    const firstId = (first as { data?: { id?: string } }).data?.id
    if (firstId) {
      created.parentIds.push(firstId)
      const row = await prisma.parent.findUnique({ where: { id: firstId }, select: { userId: true } })
      if (row?.userId) created.parentUserIds.push(row.userId)
    }

    // Credential values are unique platform-wide, so the second attempt must fail — the
    // question is whether the office sees an explanation or a Prisma stack trace.
    const second = await createParent({ firstName: STAMP, lastName: "DupTwo", email })
    expect(second.success).toBe(false)

    const message = (second as { error?: string }).error ?? ""
    expect(message).not.toMatch(/prisma|P2002|Invalid `/i)
    expect(message.toLowerCase()).toContain("email")

    // A failed create must not leave a half-made parent behind.
    const orphan = await prisma.user.findFirst({
      where: { firstName: STAMP, lastName: "DupTwo" },
      select: { id: true },
    })
    expect(orphan, "a rejected parent left an orphaned user record").toBeNull()
  })
})
