import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Grading configuration: who can change it, and what states it can be left in.
 *
 * `setDefaultGradingSystem` validated the grading system id against the caller's school and
 * then cleared `isDefault` with `updateMany({ where: { schoolId } })` — using the schoolId
 * the *caller supplied*, not the one on the record it had just checked. Passing your own
 * system's id with another school's schoolId cleared that school's default.
 *
 * The consequence is quiet. `loadGradingSystem` looks for `isDefault: true`; with none it
 * returns null and `resolveGrade` falls back to the built-in WAEC scale, cached for an
 * hour, warning only to the server log. Every result in that school is then computed on a
 * scale nobody chose.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { setDefaultGradingSystem, addGradeLevel } = await import("@/app/actions/school-settings")

const STAMP = "ZZGrading"

const created = {
  systemIds: [] as string[],
  levelIds: [] as string[],
}

let schoolId = ""
let otherSchoolId = ""
let adminUserId = ""

let homeSystemId = ""
let foreignDefaultSystemId = ""
let bandSystemId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  adminUserId = admin.id
  schoolId = admin.admin.schoolId

  const other = await prisma.school.findFirst({
    where: { id: { not: schoolId } },
    select: { id: true },
  })
  if (!other) throw new Error("Need a second school to test the boundary")
  otherSchoolId = other.id

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, role: "ADMIN", sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  // The caller's own system — a legitimate id, which is what makes the boundary test real.
  const homeSystem = await prisma.gradingSystem.create({
    data: { schoolId, name: `${STAMP} Home Scale`, isDefault: false, passMark: 40 },
    select: { id: true },
  })
  homeSystemId = homeSystem.id
  created.systemIds.push(homeSystem.id)

  // The other school's default. Created rather than hoped for: if the second school had no
  // grading system, the assertion would pass without anything being at risk.
  const foreignSystem = await prisma.gradingSystem.create({
    data: {
      schoolId: otherSchoolId,
      name: `${STAMP} Foreign Scale`,
      isDefault: true,
      passMark: 45,
    },
    select: { id: true },
  })
  foreignDefaultSystemId = foreignSystem.id
  created.systemIds.push(foreignSystem.id)

  // A separate system for the band tests, so they cannot disturb the default above.
  const bandSystem = await prisma.gradingSystem.create({
    data: { schoolId, name: `${STAMP} Band Scale`, isDefault: false, passMark: 40 },
    select: { id: true },
  })
  bandSystemId = bandSystem.id
  created.systemIds.push(bandSystem.id)

  const bandA = await prisma.gradeLevel.create({
    data: {
      gradingSystemId: bandSystem.id,
      grade: "A",
      minScore: 70,
      maxScore: 100,
      remark: "Excellent",
    },
    select: { id: true },
  })
  created.levelIds.push(bandA.id)
})

afterAll(async () => {
  await prisma.gradeLevel.deleteMany({ where: { gradingSystemId: { in: created.systemIds } } })
  await prisma.gradingSystem.deleteMany({ where: { id: { in: created.systemIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has another school holding its own default grading system", async () => {
    expect(otherSchoolId, "both schools are the same").not.toBe(schoolId)

    const foreign = await prisma.gradingSystem.findUnique({
      where: { id: foreignDefaultSystemId },
      select: { isDefault: true, schoolId: true },
    })
    expect(foreign?.schoolId, "the foreign system is not in the other school").toBe(otherSchoolId)
    expect(foreign?.isDefault, "the foreign system is not the default").toBe(true)
  })

  it("has an A band covering 70-100 to push a new band against", async () => {
    const bands = await prisma.gradeLevel.findMany({
      where: { gradingSystemId: bandSystemId },
      select: { grade: true, minScore: true, maxScore: true },
    })
    expect(bands, "no bands in the fixture").toHaveLength(1)
    expect(bands[0]).toMatchObject({ grade: "A", minScore: 70, maxScore: 100 })
  })
})

describe("setting the default grading system", () => {
  it("cannot clear another school's default", async () => {
    // A legitimate id of the caller's own, paired with someone else's schoolId.
    await setDefaultGradingSystem({ id: homeSystemId, schoolId: otherSchoolId }).catch(() => {})

    const foreign = await prisma.gradingSystem.findUnique({
      where: { id: foreignDefaultSystemId },
      select: { isDefault: true },
    })
    expect(
      foreign?.isDefault,
      "another school's default grading system was cleared — every result there now falls back to the built-in scale",
    ).toBe(true)
  })

  it("still sets the default within the caller's own school", async () => {
    const result = await setDefaultGradingSystem({ id: homeSystemId, schoolId })
    expect(result.success, `an admin was blocked from their own school: ${"error" in result ? result.error : ""}`).toBe(true)

    const home = await prisma.gradingSystem.findUnique({
      where: { id: homeSystemId },
      select: { isDefault: true },
    })
    expect(home?.isDefault, "the caller's own system was not made default").toBe(true)
  })
})

describe("grade bands", () => {
  it("refuses a band whose range overlaps an existing one", async () => {
    // A: 70-100 already exists. B: 65-80 overlaps it, so a score of 75 sits in two bands
    // at once and silently takes whichever the ordering happens to surface first.
    const result = await addGradeLevel({
      gradingSystemId: bandSystemId,
      grade: "B",
      minScore: 65,
      maxScore: 80,
      remark: "Very good",
    })

    expect(result.success, "an overlapping grade band was accepted").toBe(false)
    expect(
      "error" in result ? result.error : "",
      "refused, but not for overlapping",
    ).toMatch(/overlap/i)

    const bands = await prisma.gradeLevel.findMany({
      where: { gradingSystemId: bandSystemId },
      select: { id: true },
    })
    expect(bands, "the overlapping band was written").toHaveLength(1)
  })

  it("still accepts a band that sits below the existing one", async () => {
    const result = await addGradeLevel({
      gradingSystemId: bandSystemId,
      grade: "B",
      minScore: 60,
      maxScore: 69,
      remark: "Very good",
    })
    expect(result.success, "a non-overlapping band was refused").toBe(true)

    const bands = await prisma.gradeLevel.findMany({
      where: { gradingSystemId: bandSystemId },
      select: { grade: true },
      orderBy: { minScore: "desc" },
    })
    expect(bands.map((b) => b.grade)).toEqual(["A", "B"])
  })
})
