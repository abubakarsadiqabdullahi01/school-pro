import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * A teacher added on the academic side becoming visible to HR.
 *
 * The gap this closes, and the reason every assertion here is worth making: `createTeacher`
 * used to write a `User` and a `Teacher` and stop. HR never heard about them. They had no
 * staff number, could not be put on payroll, and nothing anywhere said so — the only link
 * between the two sides was an optional `Staff.userId` somebody had to set by hand from a
 * dropdown, having first noticed there was anybody to set it for.
 *
 * Two failure modes are guarded here, and they pull in opposite directions:
 *
 *  - Provisioning must actually happen, in the same transaction as the teacher.
 *  - The record it creates must not *look* finished. A row with a name and nothing else is
 *    indistinguishable to payroll from a complete one, which is why `onboardingStatus`
 *    exists and why `completeStaffOnboarding` refuses while anything required is missing.
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
const { createTeacher } = await import("@/app/actions/teacher-management")
const {
  getOnboardingQueue,
  linkTeacherToHr,
  completeStaffOnboarding,
  recordStaffDocument,
} = await import("@/app/actions/hr-onboarding")

const STAMP = "ZZOnboard"

let schoolId = ""
let adminUserId = ""
const createdUserIds: string[] = []
const createdStaffIds: string[] = []

/** Everything this file made, removed in reverse order of dependency. */
async function cleanUp() {
  await prisma.staffDocument.deleteMany({ where: { staff: { id: { in: createdStaffIds } } } })
  await prisma.staffSalary.deleteMany({ where: { staffId: { in: createdStaffIds } } })
  await prisma.staff.deleteMany({ where: { id: { in: createdStaffIds } } })
  await prisma.staff.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.teacher.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.credential.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
}

/** Adds a teacher the way the admin screen does, and remembers it for clean-up. */
async function addTeacher(suffix: string, staffId: string) {
  const result = await createTeacher({
    schoolId,
    firstName: `${STAMP}${suffix}`,
    lastName: "Tester",
    staffId,
    department: "Sciences",
    qualification: "B.Sc Mathematics",
    phone: "08031234567",
    credentials: [
      {
        type: "EMAIL",
        value: `${STAMP.toLowerCase()}.${suffix.toLowerCase()}@example.test`,
        passwordHash: "",
        isPrimary: true,
      },
    ],
  })

  if (result.success && result.data) createdUserIds.push(result.data.userId)
  return result
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to act as")
  schoolId = admin.admin.schoolId
  adminUserId = admin.id

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  await cleanUp()
})

afterAll(cleanUp)

describe("adding a teacher tells HR", () => {
  it("creates a staff record in the same act", async () => {
    const result = await addTeacher("Alpha", `${STAMP}-A1`)
    expect(result.success).toBe(true)

    const staff = await prisma.staff.findUnique({
      where: { userId: result.data!.userId },
      select: {
        id: true,
        staffNo: true,
        staffType: true,
        onboardingStatus: true,
        autoProvisioned: true,
        employmentStatus: true,
        department: true,
        qualification: true,
      },
    })

    expect(staff).not.toBeNull()
    createdStaffIds.push(staff!.id)
    expect(staff!.staffType).toBe("TEACHER")
    expect(staff!.employmentStatus).toBe("ACTIVE")
    expect(staff!.department).toBe("Sciences")
    expect(staff!.qualification).toBe("B.Sc Mathematics")
  })

  it("marks the record as not started, so payroll cannot mistake it for finished", async () => {
    const staff = await prisma.staff.findFirst({
      where: { firstName: `${STAMP}Alpha` },
      select: { onboardingStatus: true, autoProvisioned: true },
    })
    expect(staff!.onboardingStatus).toBe("NOT_STARTED")
    expect(staff!.autoProvisioned).toBe(true)
  })

  it("uses the staff ID the admin typed, so one person does not get two numbers", async () => {
    const staff = await prisma.staff.findFirst({
      where: { firstName: `${STAMP}Alpha` },
      select: { staffNo: true },
    })
    expect(staff!.staffNo).toBe(`${STAMP}-A1`)
  })

  it("generates a number instead when that one is already taken in HR", async () => {
    // A teacher's staffId is unique among *teachers*; it says nothing about what HR has
    // already issued. Here somebody in HR holds that number, so provisioning must fall
    // back rather than collide — `@@unique([schoolId, staffNo])` would otherwise reject
    // the insert and leave the teacher with no staff record at all.
    const squatter = await prisma.staff.create({
      data: {
        schoolId,
        staffNo: `${STAMP}-B1`,
        firstName: `${STAMP}Squatter`,
        lastName: "Tester",
        staffType: "OTHER",
        dateEmployed: new Date(),
      },
      select: { id: true },
    })
    createdStaffIds.push(squatter.id)

    const result = await addTeacher("Beta", `${STAMP}-B1`)
    expect(result.success).toBe(true)

    const staff = await prisma.staff.findUnique({
      where: { userId: result.data!.userId },
      select: { id: true, staffNo: true },
    })
    expect(staff).not.toBeNull()
    createdStaffIds.push(staff!.id)
    expect(staff!.staffNo).not.toBe(`${STAMP}-B1`)
    expect(staff!.staffNo.length).toBeGreaterThan(0)
  })
})

describe("the queue", () => {
  it("lists a teacher who has no staff record at all", async () => {
    // The safety net for teachers created before provisioning existed, and for the rare
    // live failure. Simulated here by removing the staff row the action just made.
    const result = await addTeacher("Gamma", `${STAMP}-G1`)
    const userId = result.data!.userId
    await prisma.staff.deleteMany({ where: { userId } })

    const queue = await getOnboardingQueue()
    expect(queue.success).toBe(true)

    const names = queue.success ? queue.data.unlinked.map((row) => row.name) : []
    expect(names).toContain(`${STAMP}Gamma Tester`)
  })

  it("links one on demand, and it leaves the unlinked list", async () => {
    const queue = await getOnboardingQueue()
    const target = queue.success
      ? queue.data.unlinked.find((row) => row.name === `${STAMP}Gamma Tester`)
      : undefined
    expect(target).toBeDefined()

    const linked = await linkTeacherToHr({ teacherId: target!.teacherId })
    expect(linked.success).toBe(true)

    const staff = await prisma.staff.findFirst({
      where: { firstName: `${STAMP}Gamma` },
      select: { id: true, onboardingStatus: true, autoProvisioned: true },
    })
    expect(staff).not.toBeNull()
    createdStaffIds.push(staff!.id)
    expect(staff!.onboardingStatus).toBe("NOT_STARTED")

    const after = await getOnboardingQueue()
    const stillUnlinked = after.success
      ? after.data.unlinked.map((row) => row.name)
      : []
    expect(stillUnlinked).not.toContain(`${STAMP}Gamma Tester`)
  })

  it("shows an incomplete record with what is actually outstanding", async () => {
    const queue = await getOnboardingQueue()
    const row = queue.success
      ? queue.data.incomplete.find((entry) => entry.name === `${STAMP}Alpha Tester`)
      : undefined

    expect(row).toBeDefined()
    expect(row!.autoProvisioned).toBe(true)
    expect(row!.percentComplete).toBeLessThan(100)
    // Named, not merely counted — an HR officer needs to know what to go and get.
    expect(row!.outstanding).toEqual(
      expect.arrayContaining(["Bank account", "Salary assigned", "Appointment letter"]),
    )
  })
})

describe("completion is earned, not asserted", () => {
  it("refuses while anything required is missing, and says what", async () => {
    const staff = await prisma.staff.findFirstOrThrow({
      where: { firstName: `${STAMP}Alpha` },
      select: { id: true },
    })

    const result = await completeStaffOnboarding(staff.id)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Bank account")
      expect(result.error).toContain("Salary assigned")
    }

    const after = await prisma.staff.findUniqueOrThrow({
      where: { id: staff.id },
      select: { onboardingStatus: true },
    })
    expect(after.onboardingStatus).toBe("NOT_STARTED")
  })

  it("still refuses when only one required item is missing", async () => {
    const staff = await prisma.staff.findFirstOrThrow({
      where: { firstName: `${STAMP}Alpha` },
      select: { id: true },
    })

    // Everything the checklist wants except a salary.
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        emergencyContactName: "Ngozi Tester",
        emergencyContactPhone: "08039876543",
        bankName: "Zenith Bank",
        accountNumber: "1234567890",
        accountName: `${STAMP}Alpha Tester`,
        jobTitle: "Mathematics Teacher",
      },
    })
    // Keys as the upload route writes them: this school's staff-documents folder.
    const uploaded = (uuid: string) => `/api/files/staff-documents/${schoolId}/${uuid}.pdf`
    // Anything else is refused: another school's document, or a stored expense receipt.
    for (const foreign of [
      "/api/files/staff-documents/another-school/00000000-0000-4000-8000-000000000001.pdf",
      `/api/files/expense-receipts/${schoolId}/00000000-0000-4000-8000-000000000002.pdf`,
    ]) {
      expect(await recordStaffDocument({ staffId: staff.id, type: "OTHER", title: "Not ours", storageKey: foreign }))
        .toMatchObject({ success: false, error: "Upload the document for this school first" })
    }
    expect(await recordStaffDocument({
      staffId: staff.id,
      type: "APPOINTMENT_LETTER",
      title: "Letter of appointment",
      storageKey: uploaded("00000000-0000-4000-8000-00000000000a"),
    })).toMatchObject({ success: true })
    expect(await recordStaffDocument({
      staffId: staff.id,
      type: "IDENTIFICATION",
      title: "National ID",
      storageKey: uploaded("00000000-0000-4000-8000-00000000000b"),
    })).toMatchObject({ success: true })

    const result = await completeStaffOnboarding(staff.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("Salary assigned")
  })

  it("moves out of NOT_STARTED as soon as a document is uploaded", async () => {
    const staff = await prisma.staff.findFirstOrThrow({
      where: { firstName: `${STAMP}Alpha` },
      select: { id: true, onboardingStatus: true },
    })
    expect(staff.onboardingStatus).toBe("IN_PROGRESS")
  })

  it("completes once the last required item lands", async () => {
    const staff = await prisma.staff.findFirstOrThrow({
      where: { firstName: `${STAMP}Alpha` },
      select: { id: true },
    })

    await prisma.staffSalary.create({
      data: {
        staffId: staff.id,
        baseSalary: 140000,
        effectiveFrom: new Date(),
        isActive: true,
        createdBy: adminUserId,
      },
    })

    const result = await completeStaffOnboarding(staff.id)
    expect(result.success).toBe(true)

    const after = await prisma.staff.findUniqueOrThrow({
      where: { id: staff.id },
      select: { onboardingStatus: true },
    })
    expect(after.onboardingStatus).toBe("COMPLETE")
  })

  it("drops off the queue once complete", async () => {
    const queue = await getOnboardingQueue()
    const names = queue.success ? queue.data.incomplete.map((row) => row.name) : []
    expect(names).not.toContain(`${STAMP}Alpha Tester`)
  })
})
