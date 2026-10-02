import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {}, unstable_cache: <T>(loader: T) => loader }))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { createLoginForStaff, createStaff, setStaffEmploymentStatus } = await import("@/app/actions/hr")
const { createTeacher } = await import("@/app/actions/teacher-management")
const stamp = `ZZUnified${Date.now()}`
let schoolId = ""
const users: string[] = []
const staffIds: string[] = []

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("This test requires a local database")
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } }, include: { admin: true } })
  if (!admin?.admin?.schoolId) throw new Error("Seed a local school administrator first")
  schoolId = admin.admin.schoolId
  vi.mocked(auth).mockResolvedValue({ user: { id: admin.id, sessionRecordId: null } } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await prisma.staff.deleteMany({ where: { id: { in: staffIds } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
})

describe("Unified HR staff creation", () => {
  it.each(["TEACHER", "ACCOUNTANT"])("creates one linked %s and an incomplete HR record", async (staffType) => {
    const result = await createStaff({ firstName: stamp, lastName: staffType, staffType, dateEmployed: "2026-01-01", email: `${stamp}.${staffType}@example.test`, createLogin: true })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    staffIds.push(result.data.id)
    const record = await prisma.staff.findUniqueOrThrow({ where: { id: result.data.id }, include: { user: { include: { teacher: true, admin: true, credentials: true } } } })
    if (record.userId) users.push(record.userId)
    expect(record.onboardingStatus).toBe("IN_PROGRESS")
    expect(record.user?.role).toBe(staffType)
    expect(result.data.temporaryPassword).toBeTruthy()
    expect(record.user?.credentials[0].passwordHash).not.toBe(result.data.temporaryPassword)
    if (staffType === "TEACHER") expect(record.user?.teacher?.staffId).toBe(record.staffNo)
    else expect(record.user?.admin?.schoolId).toBe(schoolId)
  })

  it("rolls back staff and login on duplicate email", async () => {
    const result = await createStaff({ firstName: stamp, lastName: "Rollback", staffType: "TEACHER", dateEmployed: "2026-01-01", email: `${stamp}.TEACHER@example.test`, createLogin: true })
    expect(result.success).toBe(false)
    expect(await prisma.staff.count({ where: { schoolId, firstName: stamp, lastName: "Rollback" } })).toBe(0)
    expect(await prisma.user.count({ where: { firstName: stamp, lastName: "Rollback" } })).toBe(0)
  })

  it.each([
    { createLogin: true },
    { accountNumber: "abc123" },
    { phone: "not a phone" },
    { dateOfBirth: "2999-01-01" },
    { staffType: "INVALID" },
  ])("rejects invalid staff input %j", async (invalid) => {
    const result = await createStaff({ firstName: stamp, lastName: "Invalid", staffType: "TEACHER", dateEmployed: "2026-01-01", ...invalid })
    expect(result.success).toBe(false)
  })

  it("does not allow the legacy teacher action to hire outside HR", async () => {
    const result = await createTeacher({ schoolId, firstName: stamp, lastName: "Bypass", staffId: `${stamp}-missing` })
    expect(result.success).toBe(false)
    expect(await prisma.user.count({ where: { firstName: stamp, lastName: "Bypass" } })).toBe(0)
  })
})

describe("a login for someone HR has already hired", () => {
  it.each(["TEACHER", "ACCOUNTANT"])("gives a %s hired without a login one, linked to their record", async (staffType) => {
    const hired = await createStaff({ firstName: stamp, lastName: `Later${staffType}`, staffType, dateEmployed: "2026-01-01" })
    if (!hired.success) throw new Error(hired.error)
    staffIds.push(hired.data.id)
    expect(hired.data.temporaryPassword).toBeUndefined()

    const email = `${stamp}.later.${staffType}@example.test`
    const login = await createLoginForStaff({ staffId: hired.data.id, email })
    if (!login.success) throw new Error(login.error)
    expect(login.data).toMatchObject({ loginEmail: email.toLowerCase(), temporaryPassword: expect.any(String) })

    const record = await prisma.staff.findUniqueOrThrow({ where: { id: hired.data.id }, include: { user: { include: { teacher: true, admin: true, credentials: true } } } })
    if (record.userId) users.push(record.userId)
    expect(record.user?.role).toBe(staffType)
    expect(record.user?.credentials[0]).toMatchObject({ type: "EMAIL", value: email.toLowerCase(), isPrimary: true })
    if (staffType === "TEACHER") expect(record.user?.teacher?.staffId).toBe(record.staffNo)
    else expect(record.user?.admin?.schoolId).toBe(schoolId)

    // Once only.
    expect(await createLoginForStaff({ staffId: hired.data.id, email: `${stamp}.again.${staffType}@example.test` }))
      .toMatchObject({ success: false, error: "This staff member already has a login" })
  })

  it("refuses an email another login already uses, creating nothing", async () => {
    const hired = await createStaff({ firstName: stamp, lastName: "Clash", staffType: "TEACHER", dateEmployed: "2026-01-01" })
    if (!hired.success) throw new Error(hired.error)
    staffIds.push(hired.data.id)
    expect(await createLoginForStaff({ staffId: hired.data.id, email: `${stamp}.TEACHER@example.test` }))
      .toMatchObject({ success: false, error: "That email address is already used by another login" })
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: hired.data.id } })).userId).toBeNull()
  })

  it("will not give a login to someone HR has let go", async () => {
    const hired = await createStaff({ firstName: stamp, lastName: "Gone", staffType: "ACCOUNTANT", dateEmployed: "2026-01-01" })
    if (!hired.success) throw new Error(hired.error)
    staffIds.push(hired.data.id)
    expect(await setStaffEmploymentStatus({ staffId: hired.data.id, employmentStatus: "TERMINATED", reason: "Test" })).toMatchObject({ success: true })
    expect(await createLoginForStaff({ staffId: hired.data.id, email: `${stamp}.gone@example.test` }))
      .toMatchObject({ success: false, error: expect.stringMatching(/Reinstate/) })
  })
})
