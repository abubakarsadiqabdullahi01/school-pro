import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * What a deactivated account can still do.
 *
 * `isActive` is copied into the JWT at sign-in (auth.config.ts) and the token lives 30 days,
 * so deactivating someone does not invalidate the token they are already holding. Exactly
 * one guard re-reads it from the database: `requireActor` in lib/authz.ts, which is why the
 * comment there says it is checked "here rather than only at sign-in".
 *
 * The guards that do NOT go through lib/authz — `getAuthenticatedUser` in
 * student-management and `checkAuthorization` in parent-management — read the role straight
 * off the session and never ask whether the account is still active. A sacked bursar or a
 * compromised account keeps working until the token expires.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { getStudents } = await import("@/app/actions/student-management")
const { searchParents } = await import("@/app/actions/parent-management")
const { getTeachers } = await import("@/app/actions/teacher-management")

const STAMP = "ZZDeactivated"

const created = {
  userIds: [] as string[],
  adminIds: [] as string[],
}

let schoolId = ""
let deadAdminUserId = ""

beforeAll(async () => {
  const reference = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { admin: { select: { schoolId: true } } },
  })
  if (!reference?.admin?.schoolId) throw new Error("No admin with a school")
  schoolId = reference.admin.schoolId

  // A real admin of the school, then switched off — the state a sacked or suspended member
  // of staff is left in. Created rather than borrowed so the suite never deactivates a
  // seeded account it does not own.
  const user = await prisma.user.create({
    data: { firstName: STAMP, lastName: "ExAdmin", role: "ADMIN", isActive: false },
    select: { id: true },
  })
  deadAdminUserId = user.id
  created.userIds.push(user.id)

  const admin = await prisma.admin.create({
    data: { userId: user.id, schoolId, permissions: "[]" },
    select: { id: true },
  })
  created.adminIds.push(admin.id)

  // The token they are still holding: issued while they were active, so it carries
  // role ADMIN and says nothing about the deactivation that happened afterwards.
  vi.mocked(auth).mockResolvedValue({
    user: { id: user.id, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
})

afterAll(async () => {
  await prisma.admin.deleteMany({ where: { id: { in: created.adminIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has an admin who is genuinely deactivated but still holds a valid token", async () => {
    const user = await prisma.user.findUnique({
      where: { id: deadAdminUserId },
      select: { isActive: true, role: true, admin: { select: { schoolId: true } } },
    })
    expect(user?.isActive, "the fixture admin is still active").toBe(false)
    expect(user?.role, "the fixture is not an admin").toBe("ADMIN")
    expect(user?.admin?.schoolId, "the admin is not attached to a school").toBe(schoolId)

    const session = await auth()
    expect(session?.user?.id, "the mocked token is not this user's").toBe(deadAdminUserId)
  })
})

describe("a deactivated admin", () => {
  it("cannot read the student roster", async () => {
    const result = await getStudents({})

    expect(
      result.success,
      "a deactivated admin read the student roster",
    ).toBe(false)
  })

  it("cannot search parents", async () => {
    const result = await searchParents("")

    expect(result.success, "a deactivated admin searched parents").toBe(false)
  })

  it("cannot read the teacher list", async () => {
    // teacher-management inlines its guard at fourteen call sites rather than using a
    // shared helper, so this is the check that the sweep across those actually landed.
    const result = await getTeachers()

    expect(result.success, "a deactivated admin read the teacher list").toBe(false)
  })
})
