import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Apart from students and parents, everyone who signs in is staff on HR's books.
 *
 * School administrators were the exception: the platform's super admin created them, and
 * nothing told HR. The person running the school had no staff number, no payslip, and an
 * employment HR could not end. Pinned here against a real database, in a school of its own
 * so the "last administrator" rule can be reached without touching anybody's real data.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: vi.fn(async () => null) }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { getActiveSchool } = await import("@/lib/school-context.server")
const { prisma } = await import("@/lib/db")
const { createAdminUser } = await import("@/app/actions/user-management")
const { createLoginForStaff, createStaff, setStaffEmploymentStatus } = await import("@/app/actions/hr")
const { getOnboardingQueue, linkSchoolAdminToHr } = await import("@/app/actions/hr-onboarding")
const { SYSTEM_PERMISSION_PROFILES } = await import("@/lib/permissions")

const STAMP = `ZZAdmins${Date.now()}`
const REFUSAL = /unauthor|missing permission|not permitted|forbidden/i

let schoolId = ""
let superAdminId = ""
let officerUserId = ""
/** The administrator the platform created, and the one HR gave a login to. */
let headStaffId = ""
let secretaryStaffId = ""
let legacyStaffId = ""

function actAs(userId: string, role?: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, role, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

const asPlatform = () => actAs(superAdminId, "SUPER_ADMIN")

async function cleanUp(id: string) {
  const logins = await prisma.user.findMany({
    where: { OR: [{ admin: { schoolId: id } }, { teacher: { schoolId: id } }, { staffRecord: { schoolId: id } }] },
    select: { id: true },
  })
  await prisma.userPermissionProfile.deleteMany({ where: { schoolId: id } })
  await prisma.staff.deleteMany({ where: { schoolId: id } })
  await prisma.user.deleteMany({ where: { id: { in: logins.map((login) => login.id) } } })
  await prisma.school.deleteMany({ where: { id } })
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("This test requires a local database")

  for (const stale of await prisma.school.findMany({ where: { name: { startsWith: "ZZAdmins" } }, select: { id: true } })) {
    await cleanUp(stale.id)
  }
  await prisma.user.deleteMany({ where: { role: "SUPER_ADMIN", firstName: { startsWith: "ZZAdmins" } } })

  const school = await prisma.school.create({
    data: { name: STAMP, code: STAMP.slice(0, 50), address: "Test", phone: "08000000000", email: `${STAMP.toLowerCase()}@example.test` },
  })
  schoolId = school.id
  vi.mocked(getActiveSchool).mockResolvedValue({ id: schoolId, name: STAMP } as Awaited<ReturnType<typeof getActiveSchool>>)

  const platform = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Platform", role: "SUPER_ADMIN", superAdmin: { create: {} } },
  })
  superAdminId = platform.id
  asPlatform()
})

afterAll(async () => {
  if (schoolId) await cleanUp(schoolId)
  if (superAdminId) await prisma.user.deleteMany({ where: { id: superAdminId } })
})

describe("school administrators are HR staff", () => {
  it("opens an HR record when the platform creates a school administrator", async () => {
    asPlatform()
    const result = await createAdminUser({
      firstName: STAMP,
      lastName: "Head",
      email: `${STAMP.toLowerCase()}.head@example.test`,
      schoolId,
      permissions: ["MANAGE_STUDENTS"],
    })
    expect(result.success).toBe(true)
    if (!result.success || !result.data) throw new Error(result.error)
    expect(result.data.staffNo).toBeTruthy()

    const staff = await prisma.staff.findUniqueOrThrow({ where: { userId: result.data.userId } })
    expect(staff).toMatchObject({
      schoolId,
      staffNo: result.data.staffNo,
      staffType: "ADMIN_STAFF",
      jobTitle: "School Administrator",
      department: "Administration",
      employmentStatus: "ACTIVE",
      onboardingStatus: "NOT_STARTED",
      autoProvisioned: true,
    })
    headStaffId = staff.id
  })

  it("lists an administrator from before in HR's queue, and linking opens their record", async () => {
    asPlatform()
    const legacy = await prisma.user.create({
      data: {
        firstName: STAMP,
        lastName: "Legacy",
        role: "ADMIN",
        admin: { create: { schoolId, permissions: "[]" } },
        credentials: {
          create: { type: "EMAIL", value: `${STAMP.toLowerCase()}.legacy@example.test`, passwordHash: "not-a-real-hash", isPrimary: true },
        },
      },
    })

    const before = await getOnboardingQueue()
    if (!before.success) throw new Error(before.error)
    expect(before.data.unlinkedAdmins.map((row) => row.userId)).toContain(legacy.id)
    // The administrator the platform created just now is already in HR.
    expect(before.data.unlinkedAdmins.map((row) => row.name)).not.toContain(`${STAMP} Head`)

    const linked = await linkSchoolAdminToHr({ userId: legacy.id })
    if (!linked.success) throw new Error(linked.error)
    const staff = await prisma.staff.findUniqueOrThrow({ where: { userId: legacy.id } })
    expect(staff).toMatchObject({ staffNo: linked.data.staffNo, staffType: "ADMIN_STAFF", jobTitle: "School Administrator" })
    legacyStaffId = staff.id

    const after = await getOnboardingQueue()
    if (!after.success) throw new Error(after.error)
    expect(after.data.unlinkedAdmins.map((row) => row.userId)).not.toContain(legacy.id)
    expect(await linkSchoolAdminToHr({ userId: legacy.id })).toMatchObject({ success: false })
  })
})

describe("an administrator login needs users.manage", () => {
  beforeAll(async () => {
    asPlatform()
    const officer = await createStaff({
      firstName: STAMP,
      lastName: "HrOfficer",
      staffType: "TEACHER",
      dateEmployed: "2026-01-01",
      email: `${STAMP.toLowerCase()}.hr@example.test`,
      createLogin: true,
    })
    if (!officer.success) throw new Error(officer.error)
    officerUserId = (await prisma.staff.findUniqueOrThrow({ where: { id: officer.data.id } })).userId!

    const hr = SYSTEM_PERMISSION_PROFILES.HR
    const profile = await prisma.permissionProfile.upsert({
      where: { schoolId_code: { schoolId, code: "HR" } },
      create: { schoolId, code: "HR", name: hr.name, permissions: hr.permissions, isSystem: true },
      update: {},
      select: { id: true },
    })
    await prisma.userPermissionProfile.create({
      data: { userId: officerUserId, schoolId, profileId: profile.id, assignedBy: superAdminId },
    })
  })

  it("lets an HR officer hire administrative staff, but not give them an administrator login", async () => {
    actAs(officerUserId)
    const withLogin = await createStaff({
      firstName: STAMP,
      lastName: "Refused",
      staffType: "ADMIN_STAFF",
      dateEmployed: "2026-01-01",
      email: `${STAMP.toLowerCase()}.refused@example.test`,
      createLogin: true,
    })
    expect(withLogin.success).toBe(false)
    expect(withLogin.success ? "" : withLogin.error).toMatch(REFUSAL)
    expect(await prisma.staff.count({ where: { schoolId, lastName: "Refused" } })).toBe(0)
    expect(await prisma.user.count({ where: { firstName: STAMP, lastName: "Refused" } })).toBe(0)

    const secretary = await createStaff({ firstName: STAMP, lastName: "Secretary", staffType: "ADMIN_STAFF", dateEmployed: "2026-01-01" })
    if (!secretary.success) throw new Error(secretary.error)
    secretaryStaffId = secretary.data.id
    expect(secretary.data.temporaryPassword).toBeUndefined()

    const login = await createLoginForStaff({ staffId: secretaryStaffId, email: `${STAMP.toLowerCase()}.secretary@example.test` })
    expect(login.success).toBe(false)
    expect(login.success ? "" : login.error).toMatch(REFUSAL)
  })

  it("gives administrative staff an administrator login for someone who holds users.manage", async () => {
    asPlatform()
    const email = `${STAMP.toLowerCase()}.secretary@example.test`
    const login = await createLoginForStaff({ staffId: secretaryStaffId, email })
    if (!login.success) throw new Error(login.error)
    const record = await prisma.staff.findUniqueOrThrow({
      where: { id: secretaryStaffId },
      include: { user: { include: { admin: true, credentials: true } } },
    })
    expect(record.user?.role).toBe("ADMIN")
    expect(record.user?.admin?.schoolId).toBe(schoolId)
    expect(record.user?.credentials[0]).toMatchObject({ type: "EMAIL", value: email, isPrimary: true })
  })
})

describe("an administrator's employment follows HR", () => {
  it("is not an HR officer's decision without users.manage", async () => {
    actAs(officerUserId)
    const result = await setStaffEmploymentStatus({ staffId: headStaffId, employmentStatus: "SUSPENDED", reason: "Test" })
    expect(result.success).toBe(false)
    expect(result.success ? "" : result.error).toMatch(REFUSAL)
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: headStaffId } })).employmentStatus).toBe("ACTIVE")
  })

  it("switches the login off when they leave, and back on when reinstated", async () => {
    asPlatform()
    const ended = await setStaffEmploymentStatus({ staffId: secretaryStaffId, employmentStatus: "TERMINATED", reason: "Test" })
    expect(ended).toMatchObject({ success: true, data: { login: "DEACTIVATED" } })
    const userId = (await prisma.staff.findUniqueOrThrow({ where: { id: secretaryStaffId } })).userId!
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(false)

    const back = await setStaffEmploymentStatus({ staffId: secretaryStaffId, employmentStatus: "ACTIVE" })
    expect(back).toMatchObject({ success: true, data: { login: "REACTIVATED" } })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(true)
  })

  it("will not let the school's last active administrator go", async () => {
    asPlatform()
    for (const staffId of [secretaryStaffId, legacyStaffId]) {
      expect(await setStaffEmploymentStatus({ staffId, employmentStatus: "RESIGNED", reason: "Test" }))
        .toMatchObject({ success: true, data: { login: "DEACTIVATED" } })
    }

    const last = await setStaffEmploymentStatus({ staffId: headStaffId, employmentStatus: "TERMINATED", reason: "Test" })
    expect(last).toMatchObject({ success: false, error: expect.stringMatching(/only active administrator/) })

    // Refused as a whole: neither the record nor the login moved.
    const head = await prisma.staff.findUniqueOrThrow({ where: { id: headStaffId }, include: { user: true } })
    expect(head.employmentStatus).toBe("ACTIVE")
    expect(head.dateExited).toBeNull()
    expect(head.user?.isActive).toBe(true)
  })
})
