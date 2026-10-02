import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Employment runs through HR, and teaching assignments through the Exams Officer.
 *
 * Four gaps, each closed in this pass and each pinned here against a real database:
 *
 *  - **The Exams Officer could not assign a teacher.** Every teacher-assignment action
 *    demanded `teachers.manage`, which that profile never held.
 *  - **HR hiring first made the same person twice.** A teacher login typed with the staff
 *    number HR had issued found the number "taken" and opened a second, empty HR record.
 *  - **Finance officers never reached HR.** `createFinanceOfficer` made a login and stopped.
 *  - **Leaving did not stop the login.** HR could terminate a teacher, and they could still
 *    sign in and change marks the next morning.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { createTeacher, deleteTeacher, getTeachers } = await import("@/app/actions/teacher-management")
const { assignTeacherToSubject } = await import("@/app/actions/teacher-assignment")
const { createStaff, setStaffEmploymentStatus } = await import("@/app/actions/hr")
const { setFinanceOfficerActive } = await import("@/app/actions/finance")
const { createFinanceOfficer } = await import("./hr-test-fixtures")
const { SYSTEM_PERMISSION_PROFILES } = await import("@/lib/permissions")

const STAMP = "ZZFunnel"
const REFUSAL = /unauthor|missing permission|not permitted|forbidden/i

let schoolId = ""
let adminUserId = ""
const createdUserIds: string[] = []
const createdStaffIds: string[] = []
const createdAssignmentIds: string[] = []

function actAs(userId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

async function cleanUp() {
  await prisma.teacherSubject.deleteMany({ where: { id: { in: createdAssignmentIds } } })
  await prisma.userPermissionProfile.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.staff.deleteMany({ where: { id: { in: createdStaffIds } } })
  await prisma.staff.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.teacher.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.admin.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.credential.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  // Anything a failed earlier run left behind.
  await prisma.staff.deleteMany({ where: { schoolId, firstName: { startsWith: STAMP } } })
}

async function addTeacher(firstName: string, lastName: string, staffId: string) {
  const existing = await prisma.staff.findFirst({ where: { schoolId, staffNo: staffId } })
  if (!existing) {
    const hired = await hire(firstName, lastName)
    staffId = hired.staffNo
  }
  const result = await createTeacher({
    schoolId,
    firstName,
    lastName,
    staffId,
    credentials: [
      {
        type: "EMAIL",
        value: `${firstName.toLowerCase()}.${Date.now()}@example.test`,
        passwordHash: "",
        isPrimary: true,
      },
    ],
  })
  if (result.success && result.data) createdUserIds.push(result.data.userId)
  return result
}

async function hire(firstName: string, lastName: string) {
  const result = await createStaff({
    firstName,
    lastName,
    staffType: "TEACHER",
    dateEmployed: new Date().toISOString(),
    confirmDuplicate: true,
  })
  if (!result.success) throw new Error(`createStaff: ${result.error}`)
  createdStaffIds.push(result.data.id)
  return result.data
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to act as")
  schoolId = admin.admin.schoolId
  adminUserId = admin.id
  actAs(adminUserId)
  await cleanUp()
})

afterAll(async () => {
  actAs(adminUserId)
  await cleanUp()
})

describe("HR hires first, the login follows", () => {
  it("attaches the new login to the record HR already made", async () => {
    const hired = await hire(`${STAMP}Hired`, "First")

    const result = await addTeacher(`${STAMP}Hired`, "First", hired.staffNo)
    expect(result.success).toBe(true)
    if (!result.success || !result.data) return
    expect(result.data.linkedToExistingHrRecord).toBe(true)
    expect(result.data.staffNo).toBe(hired.staffNo)

    // One human, one HR record - not HR's plus an empty shell.
    const records = await prisma.staff.findMany({
      where: { schoolId, OR: [{ userId: result.data.userId }, { firstName: `${STAMP}Hired` }] },
      select: { id: true, userId: true },
    })
    expect(records).toHaveLength(1)
    expect(records[0]).toEqual({ id: hired.id, userId: result.data.userId })
  })

  it("does not hand one person's HR record to somebody else on a mistyped number", async () => {
    const hired = await hire(`${STAMP}Owner`, "Record")

    const result = await addTeacher(`${STAMP}Stranger`, "Other", hired.staffNo)
    expect(result.success).toBe(false)

    const original = await prisma.staff.findUniqueOrThrow({ where: { id: hired.id }, select: { userId: true } })
    expect(original.userId).toBeNull()
  })
})

describe("finance officers reach HR", () => {
  it("opens an HR record when a finance officer is created", async () => {
    const result = await createFinanceOfficer({
      firstName: `${STAMP}Bursar`,
      lastName: "Officer",
      email: `zzfunnel.bursar.${Date.now()}@example.test`,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    createdUserIds.push(result.data.userId)
    expect(result.data.staffNo).toBeTruthy()

    const staff = await prisma.staff.findUniqueOrThrow({
      where: { userId: result.data.userId },
      select: { staffType: true, onboardingStatus: true, autoProvisioned: true, department: true },
    })
    expect(staff).toEqual({
      staffType: "ACCOUNTANT",
      onboardingStatus: "IN_PROGRESS",
      autoProvisioned: false,
      department: "Finance",
    })
  })

  it("cannot switch back on, from the Finance Staff screen, a bursar HR has let go", async () => {
    const created = await createFinanceOfficer({
      firstName: `${STAMP}Gone`,
      lastName: "Bursar",
      email: `zzfunnel.gone.${Date.now()}@example.test`,
    })
    if (!created.success) throw new Error(created.error)
    createdUserIds.push(created.data.userId)
    const staff = await prisma.staff.findUniqueOrThrow({ where: { userId: created.data.userId }, select: { id: true } })
    expect(await setStaffEmploymentStatus({ staffId: staff.id, employmentStatus: "TERMINATED", reason: "Test" })).toMatchObject({ success: true })

    expect(await setFinanceOfficerActive({ userId: created.data.userId, isActive: true }))
      .toMatchObject({ success: false, error: expect.stringMatching(/HR records this person .* as terminated/) })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: created.data.userId }, select: { isActive: true } }))
      .toEqual({ isActive: false })

    // Reinstating in HR is the way back, and it switches the login on by itself.
    expect(await setStaffEmploymentStatus({ staffId: staff.id, employmentStatus: "ACTIVE" })).toMatchObject({ success: true })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: created.data.userId }, select: { isActive: true } }))
      .toEqual({ isActive: true })
  })
})

describe("leaving switches the login off", () => {
  let userId = ""
  let staffId = ""

  beforeAll(async () => {
    const result = await addTeacher(`${STAMP}Leaver`, "Teacher", `${STAMP}-L1`)
    if (!result.success || !result.data) throw new Error(`addTeacher: ${result.error}`)
    userId = result.data.userId
    const staff = await prisma.staff.findUniqueOrThrow({ where: { userId }, select: { id: true } })
    staffId = staff.id
  })

  it("deactivates a terminated teacher's login", async () => {
    const result = await setStaffEmploymentStatus({ staffId, employmentStatus: "TERMINATED", reason: "Test" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.login).toBe("DEACTIVATED")

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true } })
    expect(user.isActive).toBe(false)
  })

  it("switches it back on when they are re-engaged", async () => {
    const result = await setStaffEmploymentStatus({ staffId, employmentStatus: "ACTIVE" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.login).toBe("REACTIVATED")

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true } })
    expect(user.isActive).toBe(true)
  })
})

describe("the Exams Officer assigns, but does not hire", () => {
  let officerUserId = ""
  let targetTeacherId = ""

  beforeAll(async () => {
    actAs(adminUserId)
    const officer = await addTeacher(`${STAMP}Exams`, "Officer", `${STAMP}-E1`)
    const target = await addTeacher(`${STAMP}Target`, "Teacher", `${STAMP}-T1`)
    if (!officer.success || !officer.data || !target.success || !target.data) {
      throw new Error("Could not create the teachers for this test")
    }
    officerUserId = officer.data.userId
    targetTeacherId = target.data.id

    const exams = SYSTEM_PERMISSION_PROFILES.EXAMS
    const profile = await prisma.permissionProfile.upsert({
      where: { schoolId_code: { schoolId, code: "EXAMS" } },
      create: { schoolId, code: "EXAMS", name: exams.name, permissions: exams.permissions, isSystem: true },
      update: {},
      select: { id: true },
    })
    await prisma.userPermissionProfile.create({
      data: { userId: officerUserId, schoolId, profileId: profile.id, assignedBy: adminUserId },
    })
    actAs(officerUserId)
  })

  afterAll(() => actAs(adminUserId))

  it("can open the teacher directory", async () => {
    const result = await getTeachers()
    expect(result.success).toBe(true)
  })

  it("can assign a teacher to a subject", async () => {
    const [subject, term] = await Promise.all([
      prisma.subject.findFirst({ where: { schoolId }, select: { id: true } }),
      prisma.term.findFirst({
        where: { isCurrent: true, session: { schoolId } },
        select: { id: true, endDate: true },
      }),
    ])
    if (!subject || !term) return

    const result = await assignTeacherToSubject({
      teacherId: targetTeacherId,
      subjectId: subject.id,
      termId: term.id,
    })
    // What this test is about: the permission. It must never be the reason for a refusal.
    expect("error" in result ? result.error : "").not.toMatch(REFUSAL)
    // A current term whose end date has passed is refused for everyone but a super admin,
    // which is a term rule, not an authorization one.
    if (term.endDate && term.endDate < new Date()) return
    expect(result.success).toBe(true)

    const row = await prisma.teacherSubject.findUnique({
      where: {
        teacherId_subjectId_termId: { teacherId: targetTeacherId, subjectId: subject.id, termId: term.id },
      },
      select: { id: true },
    })
    expect(row).not.toBeNull()
    if (row) createdAssignmentIds.push(row.id)
  })

  it("cannot hire a teacher", async () => {
    const result = await createTeacher({
      schoolId,
      firstName: `${STAMP}Nope`,
      lastName: "Hire",
      staffId: `${STAMP}-X1`,
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(REFUSAL)
  })

  it("cannot remove a teacher", async () => {
    const result = await deleteTeacher(targetTeacherId)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(REFUSAL)
  })
})
