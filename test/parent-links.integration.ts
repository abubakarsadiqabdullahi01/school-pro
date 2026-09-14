import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The parent–student link, and the one thing that is never valid: a parent in one school
 * holding a child in another.
 *
 * For an ADMIN both ends are pinned to the session's school, so they cannot mismatch. A
 * SUPER_ADMIN is scoped to no school at all, and both ends were only ever checked against
 * the caller — never against each other. A single mismatched link puts another school's
 * child on a stranger's parent portal, with their marks, attendance and fees.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { linkStudentToParent } = await import("@/app/actions/parent-management")

const STAMP = "ZZParentLinks"

const created = {
  userIds: [] as string[],
  studentIds: [] as string[],
  parentIds: [] as string[],
}

let schoolId = ""
let otherSchoolId = ""
let superAdminUserId = ""

let homeParentId = ""
let homeStudentId = ""
let foreignStudentId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  schoolId = admin.admin.schoolId

  const other = await prisma.school.findFirst({
    where: { id: { not: schoolId } },
    select: { id: true },
  })
  if (!other) throw new Error("Need a second school to test the boundary")
  otherSchoolId = other.id

  // A real SUPER_ADMIN, created rather than borrowed: the seeded database may not have one,
  // and an absent actor would make every assertion below pass without calling the code.
  const superUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "SuperAdmin", role: "SUPER_ADMIN" },
    select: { id: true },
  })
  superAdminUserId = superUser.id
  created.userIds.push(superUser.id)

  vi.mocked(auth).mockResolvedValue({
    user: { id: superUser.id, role: "SUPER_ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  const parentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Parent", role: "PARENT" },
    select: { id: true },
  })
  created.userIds.push(parentUser.id)
  const parent = await prisma.parent.create({
    data: { userId: parentUser.id, schoolId },
    select: { id: true },
  })
  homeParentId = parent.id
  created.parentIds.push(parent.id)

  const homeStudentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "HomeChild", role: "STUDENT" },
    select: { id: true },
  })
  created.userIds.push(homeStudentUser.id)
  const homeStudent = await prisma.student.create({
    data: {
      userId: homeStudentUser.id,
      schoolId,
      admissionNo: `${STAMP}-HOME-${Date.now()}`,
      year: 2024,
    },
    select: { id: true },
  })
  homeStudentId = homeStudent.id
  created.studentIds.push(homeStudent.id)

  const foreignStudentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "ForeignChild", role: "STUDENT" },
    select: { id: true },
  })
  created.userIds.push(foreignStudentUser.id)
  const foreignStudent = await prisma.student.create({
    data: {
      userId: foreignStudentUser.id,
      schoolId: otherSchoolId,
      admissionNo: `${STAMP}-FOREIGN-${Date.now()}`,
      year: 2024,
    },
    select: { id: true },
  })
  foreignStudentId = foreignStudent.id
  created.studentIds.push(foreignStudent.id)
})

afterAll(async () => {
  await prisma.studentParent.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  await prisma.parent.deleteMany({ where: { id: { in: created.parentIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has a parent and two students in genuinely different schools", async () => {
    expect(otherSchoolId, "both schools are the same").not.toBe(schoolId)

    const parent = await prisma.parent.findUnique({
      where: { id: homeParentId },
      select: { schoolId: true },
    })
    const foreign = await prisma.student.findUnique({
      where: { id: foreignStudentId },
      select: { schoolId: true },
    })
    expect(parent?.schoolId, "the parent is not in the home school").toBe(schoolId)
    expect(foreign?.schoolId, "the foreign student is not in the other school").toBe(otherSchoolId)
  })

  it("is acting as a real SUPER_ADMIN", async () => {
    // A mock whose role the action does not accept would be refused before any of the
    // logic under test ran, and the refusal below would mean nothing.
    const actor = await prisma.user.findUnique({
      where: { id: superAdminUserId },
      select: { role: true },
    })
    expect(actor?.role).toBe("SUPER_ADMIN")
  })
})

describe("linking a student to a parent", () => {
  it("refuses a child from another school", async () => {
    const result = await linkStudentToParent({
      parentId: homeParentId,
      studentId: foreignStudentId,
      relationship: "Father",
    })

    expect(result.success, "a parent was linked to another school's child").toBe(false)

    const link = await prisma.studentParent.findFirst({
      where: { parentId: homeParentId, studentId: foreignStudentId },
      select: { id: true },
    })
    expect(link, "a cross-school parent link was written").toBeNull()
  })

  it("still links a child in the same school", async () => {
    // The guard must not block the ordinary case it exists to protect.
    const result = await linkStudentToParent({
      parentId: homeParentId,
      studentId: homeStudentId,
      relationship: "Father",
    })

    expect(result.success, `a same-school link was refused: ${"error" in result ? result.error : ""}`).toBe(true)

    const link = await prisma.studentParent.findFirst({
      where: { parentId: homeParentId, studentId: homeStudentId },
      select: { id: true },
    })
    expect(link, "the same-school link was not written").not.toBeNull()
  })
})
