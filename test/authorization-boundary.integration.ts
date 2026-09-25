import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Role boundaries, checked against a real database.
 *
 * A route guard is not an authorization boundary. `app/dashboard/(roles)/admin/layout.tsx`
 * redirects a non-admin away from the admin pages, but a server action is a POST endpoint
 * that can be called directly, so every action has to defend itself.
 *
 * This matters most for the accountant, whose record hangs off the same `Admin` table as a
 * real admin so that one person keeps one school. Any action that authorises by asking
 * "does this user have an Admin row" rather than "what is this user's role" hands an
 * accountant the whole school.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {},
  // `lib/authz` reaches session expiry, which caches the school's idle limits.
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { createFinanceOfficer } = await import("@/app/actions/finance")
const {
  createStudent,
  deleteStudent,
  toggleStudentStatus,
  updateStudent,
  createParent,
} = await import("@/app/actions/student-management")

let adminUserId = ""
let accountantUserId = ""
let schoolId = ""
let victimStudentId = ""

/**
 * Signs in as a real user, carrying their real role.
 *
 * The role matters: several actions read `session.user.role` directly rather than going
 * through `requireActor`, so a mock that omits it makes every role look like `undefined` —
 * which refuses admins and accountants alike, and would let this suite pass while proving
 * nothing at all.
 */
async function actAs(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, role: true, firstName: true, lastName: true, isActive: true },
  })
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      sessionRecordId: null,
    },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

/** Every one of these throws or returns a failure; both count as refused. */
async function refused(run: () => Promise<unknown>): Promise<string> {
  try {
    const result = (await run()) as { success?: boolean; error?: string }
    if (result && result.success === false) return result.error ?? "refused"
    throw new Error("ALLOWED — the action did not refuse an accountant")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("ALLOWED")) throw error
    return message
  }
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to test against")

  adminUserId = admin.id
  schoolId = admin.admin.schoolId
  await actAs(adminUserId)

  const officer = await createFinanceOfficer({
    firstName: "ZZ",
    lastName: "Boundary",
    email: `zz.boundary.${Date.now()}@example.test`,
  })
  if (!officer.success) throw new Error(`Could not create the accountant: ${officer.error}`)
  accountantUserId = officer.data.userId

  // A real student for the accountant to try to tamper with.
  const student = await prisma.student.findFirst({ where: { schoolId }, select: { id: true } })
  victimStudentId = student?.id ?? ""
})

afterAll(async () => {
  // Belt and braces: if a regression ever lets one of these through, the school's data is
  // restored rather than left deactivated by a security test.
  if (victimStudentId) {
    const student = await prisma.student.findUnique({
      where: { id: victimStudentId },
      select: { userId: true },
    })
    if (student) {
      await prisma.user.update({ where: { id: student.userId }, data: { isActive: true } })
    }
  }
  const strays = await prisma.user.findMany({
    where: { lastName: "ShouldNotExist" },
    select: { id: true },
  })
  if (strays.length > 0) {
    const ids = strays.map((user) => user.id)
    await prisma.studentParent.deleteMany({ where: { parent: { userId: { in: ids } } } })
    await prisma.parent.deleteMany({ where: { userId: { in: ids } } })
    await prisma.credential.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
  }

  if (accountantUserId) {
    await prisma.admin.deleteMany({ where: { userId: accountantUserId } })
    await prisma.credential.deleteMany({ where: { userId: accountantUserId } })
    await prisma.user.deleteMany({ where: { id: accountantUserId } })
  }
  await prisma.$disconnect()
})

/**
 * What a refusal looks like.
 *
 * Matches the shape of an authorization failure rather than one exact sentence. These
 * assertions used to pin `/unauthor/i`, which stopped matching when the permission system
 * started naming the permission it wanted ("Missing permission: students.manage") - a
 * clearer message that read as five broken tests. What matters is that the action was
 * refused on authorization grounds, not the prose it was refused in.
 */
const REFUSAL = /unauthor|missing permission|not permitted|forbidden/i

describe("an accountant cannot reach the student module", () => {
  beforeAll(async () => actAs(accountantUserId))

  it("cannot create a student", async () => {
    const message = await refused(() =>
      createStudent({
        firstName: "ZZ",
        lastName: "ShouldNotExist",
        dateOfBirth: "2010-01-01",
        year: new Date().getFullYear(),
        classId: "any",
        termId: "any",
      }),
    )
    expect(message).toMatch(REFUSAL)
  })

  it("cannot update a student", async () => {
    if (!victimStudentId) return
    const message = await refused(() =>
      updateStudent({
        studentId: victimStudentId,
        data: { firstName: "Tampered", lastName: "Tampered" },
      }),
    )
    expect(message).toMatch(REFUSAL)
  })

  it("cannot delete a student", async () => {
    if (!victimStudentId) return
    const message = await refused(() => deleteStudent(victimStudentId))
    expect(message).toMatch(REFUSAL)
  })

  it("cannot deactivate a student", async () => {
    if (!victimStudentId) return
    const message = await refused(() => toggleStudentStatus(victimStudentId))
    expect(message).toMatch(REFUSAL)
  })

  it("cannot create a parent", async () => {
    const message = await refused(() =>
      createParent({
        firstName: "ZZ",
        lastName: "ShouldNotExist",
        email: `zz.nope.${Date.now()}@example.test`,
      }),
    )
    expect(message).toMatch(REFUSAL)
  })

  it("leaves the student untouched after all of that", async () => {
    if (!victimStudentId) return
    const student = await prisma.student.findUnique({
      where: { id: victimStudentId },
      select: { id: true, user: { select: { firstName: true } } },
    })
    expect(student, "the student must still exist").toBeTruthy()
    expect(student!.user.firstName).not.toBe("Tampered")
  })
})

describe("an admin still can", () => {
  beforeAll(async () => actAs(adminUserId))

  it("is not locked out by the accountant guard", async () => {
    // The fix must refuse accountants without also refusing the people whose module it is.
    const { getStudents } = await import("@/app/actions/student-management")
    const result = await getStudents({})
    expect(result.success).toBe(true)
  })
})
