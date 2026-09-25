import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Who is allowed to move a session or a term.
 *
 * `updateSessionDates` and `updateTermDates` checked that the caller was logged in and
 * nothing else — no role, and no check that the record belonged to the caller's school.
 * Any authenticated account, including a student's or a parent's, could rewrite the dates
 * of any session or term in any school on the platform.
 *
 * These dates are not cosmetic. `isCurrent` is derived from them, and the current term
 * decides which enrolments are active, which results count as this term's, what the fee
 * schedules bill against, and who is eligible for promotion.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {},
  // `lib/authz` reaches session expiry, which caches the school's idle limits.
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { updateSessionDates, updateTermDates } = await import("@/app/actions/school-calendar")

const STAMP = "ZZCalendarBoundary"

const ORIGINAL_START = new Date("2024-09-01T00:00:00.000Z")
const ORIGINAL_END = new Date("2024-12-15T00:00:00.000Z")
const ATTACKER_START = new Date("2030-01-01T00:00:00.000Z")
const ATTACKER_END = new Date("2030-06-30T00:00:00.000Z")

const created = {
  userIds: [] as string[],
  studentIds: [] as string[],
  sessionIds: [] as string[],
  termIds: [] as string[],
}

let adminUserId = ""
let schoolId = ""
let otherSchoolId = ""
let studentUserId = ""

let foreignSessionId = ""
let foreignTermId = ""
let homeSessionId = ""
let homeTermId = ""

function actAs(userId: string, role: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, role, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)
}

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

  // A real student account. Created rather than borrowed: without one the "a student can
  // do this" assertions would never run against a genuine non-admin role.
  const studentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Pupil", role: "STUDENT" },
    select: { id: true },
  })
  studentUserId = studentUser.id
  created.userIds.push(studentUser.id)

  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      schoolId,
      admissionNo: `${STAMP}-${Date.now()}`,
      year: 2024,
    },
    select: { id: true },
  })
  created.studentIds.push(student.id)

  const foreignSession = await prisma.session.create({
    data: {
      schoolId: otherSchoolId,
      name: `${STAMP} Foreign Session`,
      startDate: ORIGINAL_START,
      endDate: ORIGINAL_END,
    },
    select: { id: true },
  })
  foreignSessionId = foreignSession.id
  created.sessionIds.push(foreignSession.id)

  const foreignTerm = await prisma.term.create({
    data: {
      sessionId: foreignSession.id,
      name: `${STAMP} Foreign Term`,
      startDate: ORIGINAL_START,
      endDate: ORIGINAL_END,
    },
    select: { id: true },
  })
  foreignTermId = foreignTerm.id
  created.termIds.push(foreignTerm.id)

  // The admin's own session and term, so the guard can be shown not to block the ordinary
  // case it exists to protect.
  const homeSession = await prisma.session.create({
    data: {
      schoolId,
      name: `${STAMP} Home Session`,
      startDate: ORIGINAL_START,
      endDate: ORIGINAL_END,
    },
    select: { id: true },
  })
  homeSessionId = homeSession.id
  created.sessionIds.push(homeSession.id)

  const homeTerm = await prisma.term.create({
    data: {
      sessionId: homeSession.id,
      name: `${STAMP} Home Term`,
      startDate: ORIGINAL_START,
      endDate: ORIGINAL_END,
    },
    select: { id: true },
  })
  homeTermId = homeTerm.id
  created.termIds.push(homeTerm.id)
})

afterAll(async () => {
  await prisma.term.deleteMany({ where: { id: { in: created.termIds } } })
  await prisma.session.deleteMany({ where: { id: { in: created.sessionIds } } })
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has a genuine student account, not an admin", async () => {
    const user = await prisma.user.findUnique({
      where: { id: studentUserId },
      select: { role: true },
    })
    expect(user?.role, "the actor is not actually a student").toBe("STUDENT")
  })

  it("has a term in a school the student does not belong to", async () => {
    expect(otherSchoolId, "both schools are the same").not.toBe(schoolId)
    const term = await prisma.term.findUnique({
      where: { id: foreignTermId },
      select: { session: { select: { schoolId: true } } },
    })
    expect(term?.session.schoolId).toBe(otherSchoolId)
  })
})

describe("a student cannot move the academic calendar", () => {
  it("refuses to let a student rewrite a term's dates", async () => {
    actAs(studentUserId, "STUDENT")

    const result = await updateTermDates(foreignTermId, ATTACKER_START, ATTACKER_END)
    expect(result.success, "a student rewrote a term's dates").toBe(false)

    const term = await prisma.term.findUnique({
      where: { id: foreignTermId },
      select: { startDate: true, endDate: true },
    })
    expect(term?.startDate.toISOString(), "the term's start date was changed").toBe(
      ORIGINAL_START.toISOString(),
    )
    expect(term?.endDate.toISOString(), "the term's end date was changed").toBe(
      ORIGINAL_END.toISOString(),
    )
  })

  it("refuses to let a student rewrite a session's dates", async () => {
    actAs(studentUserId, "STUDENT")

    const result = await updateSessionDates(foreignSessionId, ATTACKER_START, ATTACKER_END)
    expect(result.success, "a student rewrote a session's dates").toBe(false)

    const session = await prisma.session.findUnique({
      where: { id: foreignSessionId },
      select: { startDate: true, endDate: true },
    })
    expect(session?.startDate.toISOString()).toBe(ORIGINAL_START.toISOString())
    expect(session?.endDate.toISOString()).toBe(ORIGINAL_END.toISOString())
  })
})

describe("an admin cannot reach across schools", () => {
  it("refuses a term belonging to another school", async () => {
    actAs(adminUserId, "ADMIN")

    const result = await updateTermDates(foreignTermId, ATTACKER_START, ATTACKER_END)
    expect(result.success, "an admin moved another school's term").toBe(false)

    const term = await prisma.term.findUnique({
      where: { id: foreignTermId },
      select: { startDate: true },
    })
    expect(term?.startDate.toISOString()).toBe(ORIGINAL_START.toISOString())
  })

  it("refuses a session belonging to another school", async () => {
    actAs(adminUserId, "ADMIN")

    const result = await updateSessionDates(foreignSessionId, ATTACKER_START, ATTACKER_END)
    expect(result.success, "an admin moved another school's session").toBe(false)

    const session = await prisma.session.findUnique({
      where: { id: foreignSessionId },
      select: { startDate: true },
    })
    expect(session?.startDate.toISOString()).toBe(ORIGINAL_START.toISOString())
  })
})

describe("the ordinary case still works", () => {
  it("lets an admin move their own school's term", async () => {
    actAs(adminUserId, "ADMIN")

    const newStart = new Date("2024-09-10T00:00:00.000Z")
    const newEnd = new Date("2024-12-20T00:00:00.000Z")
    const result = await updateTermDates(homeTermId, newStart, newEnd)
    expect(result.success, `an admin was blocked from their own term: ${result.message}`).toBe(true)

    const term = await prisma.term.findUnique({
      where: { id: homeTermId },
      select: { startDate: true, endDate: true },
    })
    expect(term?.startDate.toISOString()).toBe(newStart.toISOString())
    expect(term?.endDate.toISOString()).toBe(newEnd.toISOString())
  })

  it("lets an admin move their own school's session", async () => {
    actAs(adminUserId, "ADMIN")

    const newStart = new Date("2024-09-10T00:00:00.000Z")
    const newEnd = new Date("2025-07-20T00:00:00.000Z")
    const result = await updateSessionDates(homeSessionId, newStart, newEnd)
    expect(result.success, `an admin was blocked from their own session: ${result.message}`).toBe(true)

    const session = await prisma.session.findUnique({
      where: { id: homeSessionId },
      select: { startDate: true },
    })
    expect(session?.startDate.toISOString()).toBe(newStart.toISOString())
  })
})
