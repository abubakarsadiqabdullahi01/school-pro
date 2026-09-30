import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * Student transitions at term end.
 *
 * A transition is the hinge between one term and the next: it closes the old enrolment and
 * opens a new one. Getting it wrong does not throw — it quietly leaves a student enrolled
 * somewhere they should not be, and everything downstream that filters on ACTIVE (fee
 * billing above all, plus class lists and headcounts) then follows the mistake.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {},
  // `lib/authz` reaches session expiry, which caches the school's idle limits.
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { auth } = await import("@/auth")
const { prisma } = await import("@/lib/db")
const { executeStudentTransitions, getTransitionPolicy, saveTransitionPolicy } = await import(
  "@/app/actions/student-transitions"
)

let schoolId = ""
let studentId = ""
let fromClassTermId = ""
let toClassTermId = ""

/** Returns the student to a single ACTIVE enrolment in the source class. */
async function resetToStart() {
  await prisma.studentTransition.deleteMany({ where: { studentId } })
  await prisma.studentEnrollmentHistory.deleteMany({
    where: { studentId, action: { in: ["PROMOTED", "TRANSFERRED", "WITHDRAWN"] } },
  })
  await prisma.studentClassTerm.deleteMany({ where: { studentId, classTermId: toClassTermId } })
  await prisma.studentClassTerm.updateMany({
    where: { studentId, classTermId: fromClassTermId },
    data: { status: "ACTIVE" },
  })
}

/** Every enrolment row this student has, which is what a transition is judged by. */
async function enrolments() {
  return prisma.studentClassTerm.findMany({
    where: { studentId },
    select: { classTermId: true, status: true },
  })
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to transition within")
  schoolId = admin.admin.schoolId

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  const enrolment = await prisma.studentClassTerm.findFirst({
    where: { status: "ACTIVE", student: { schoolId } },
    select: { studentId: true, classTermId: true },
  })
  if (!enrolment) throw new Error("No active enrolment to transition")

  studentId = enrolment.studentId
  fromClassTermId = enrolment.classTermId

  const destination = await prisma.classTerm.findFirst({
    where: { id: { not: fromClassTermId }, class: { schoolId } },
    select: { id: true },
  })
  if (!destination) throw new Error("No second class term to transition into")
  toClassTermId = destination.id

  const clash = await prisma.studentClassTerm.findFirst({
    where: { studentId, classTermId: toClassTermId },
    select: { id: true },
  })
  if (clash) throw new Error("The chosen student is already in the destination class")
})

afterAll(async () => {
  await resetToStart()
  // Both rules off is the shipped default; the suite must not leave a policy behind.
  await prisma.transitionPolicy.deleteMany({ where: { schoolId } })
  await prisma.$disconnect()
})

describe("promoting a student to the next class", () => {
  it("closes the old enrolment as COMPLETED and opens an ACTIVE one", async () => {
    await resetToStart()

    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "PROMOTION",
      notes: "End of term promotion",
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)

    const rows = await enrolments()
    const previous = rows.find((row) => row.classTermId === fromClassTermId)
    const current = rows.find((row) => row.classTermId === toClassTermId)

    // Previous term: kept, not deleted — results, attendance and fee charges hang off it —
    // but closed, so nothing counts it as current.
    expect(previous?.status).toBe("COMPLETED")
    // Current term: a new row, active, ready to be taught and billed.
    expect(current?.status).toBe("ACTIVE")
    // And exactly one active enrolment, never two.
    expect(rows.filter((row) => row.status === "ACTIVE")).toHaveLength(1)
  })

  it("records the move in both the history and the audit trail", async () => {
    const [history, transition] = await Promise.all([
      prisma.studentEnrollmentHistory.findFirst({
        where: { studentId, classTermId: toClassTermId },
        orderBy: { createdAt: "desc" },
        select: { action: true, previousClassTermId: true },
      }),
      prisma.studentTransition.findFirst({
        where: { studentId, toClassTermId },
        orderBy: { createdAt: "desc" },
        select: { transitionType: true, fromClassTermId: true },
      }),
    ])

    expect(history?.action).toBe("PROMOTED")
    expect(history?.previousClassTermId).toBe(fromClassTermId)
    expect(transition?.transitionType).toBe("PROMOTION")
    expect(transition?.fromClassTermId).toBe(fromClassTermId)
  })

  it("refuses to put the same student in the same class twice", async () => {
    // Guards a double-click or a re-run from duplicating an enrolment.
    const again = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "PROMOTION",
    })
    expect(again.success).toBe(false)
  })
})

describe("transferring a student to another class", () => {
  it("closes the old enrolment as TRANSFERRED", async () => {
    await resetToStart()

    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "TRANSFER",
      notes: "Moved to another arm",
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)

    const rows = await enrolments()
    // The status is what distinguishes a transfer from a promotion in the record.
    expect(rows.find((row) => row.classTermId === fromClassTermId)?.status).toBe("TRANSFERRED")
    expect(rows.find((row) => row.classTermId === toClassTermId)?.status).toBe("ACTIVE")
  })
})

describe("withdrawing a student", () => {
  it("must not leave them actively enrolled anywhere", async () => {
    await resetToStart()

    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "WITHDRAWAL",
      notes: "Left the school",
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)

    const previous = await prisma.studentClassTerm.findFirst({
      where: { studentId, classTermId: fromClassTermId },
      select: { status: true },
    })
    expect(previous?.status).toBe("DROPPED")

    // The point of the test: a withdrawn student has left the school, so nothing should
    // still call them ACTIVE. Anything filtering on ACTIVE — fee billing above all — would
    // otherwise keep charging somebody who is gone.
    const stillActive = await prisma.studentClassTerm.findMany({
      where: { studentId, status: "ACTIVE" },
      select: { classTermId: true },
    })
    expect(stillActive, "a withdrawn student is still enrolled somewhere").toEqual([])
  })

  it("creates no onward enrolment at all", async () => {
    const created = await prisma.studentClassTerm.findFirst({
      where: { studentId, classTermId: toClassTermId },
      select: { id: true },
    })
    expect(created, "a withdrawal must not enrol the student anywhere new").toBeNull()
  })

  it("records the withdrawal against the class they actually left", async () => {
    const history = await prisma.studentEnrollmentHistory.findFirst({
      where: { studentId, action: "WITHDRAWN" },
      orderBy: { createdAt: "desc" },
      select: { classTermId: true, previousClassTermId: true },
    })
    expect(history?.classTermId).toBe(fromClassTermId)
    expect(history?.previousClassTermId).toBe(fromClassTermId)
  })
})

describe("the promotion policy", () => {
  /** Every active student in the source class, so assertions cover the whole cohort. */
  async function classCohort() {
    const rows = await prisma.studentClassTerm.findMany({
      where: { classTermId: fromClassTermId, status: "ACTIVE" },
      select: { studentId: true },
    })
    return rows.map((row) => row.studentId)
  }

  it("promotes freely when both switches are off", async () => {
    await resetToStart()
    await prisma.transitionPolicy.deleteMany({ where: { schoolId } })

    const policy = await getTransitionPolicy()
    expect(policy.data?.requireResultsPublished).toBe(false)
    expect(policy.data?.usePromotionCriteria).toBe(false)

    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "PROMOTION",
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)
  })

  it("refuses to turn the criteria on without a bar to measure against", async () => {
    // A bar with nothing set would silently pass everyone.
    const saved = await saveTransitionPolicy({
      requireResultsPublished: false,
      usePromotionCriteria: true,
      minAverage: null,
      minSubjectsPassed: null,
    })
    expect(saved.success).toBe(false)
    expect(saved.error).toContain("Set a minimum average")
  })

  it("rejects an average outside 0-100", async () => {
    const saved = await saveTransitionPolicy({
      requireResultsPublished: false,
      usePromotionCriteria: true,
      minAverage: 140,
    })
    expect(saved.success).toBe(false)
    expect(saved.error).toContain("between 0 and 100")
  })

  it("blocks promotion when results are not published, and names who", async () => {
    await resetToStart()
    expect(
      (await saveTransitionPolicy({ requireResultsPublished: true, usePromotionCriteria: false })).success,
    ).toBe(true)

    const cohort = await classCohort()
    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: cohort,
      transitionType: "PROMOTION",
    })

    // The seeded data has no published results, so this must be refused.
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/promotion policy/i)
    // Named, not just counted, so the admin can act on it.
    expect(result.error).toMatch(/results|No results/i)

    // And nothing moved: a refused promotion must not half-apply.
    const rows = await enrolments()
    expect(rows.find((row) => row.classTermId === toClassTermId)).toBeUndefined()
    expect(rows.find((row) => row.classTermId === fromClassTermId)?.status).toBe("ACTIVE")
  })

  it("lets an admin override deliberately, and records that on the transition", async () => {
    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "PROMOTION",
      notes: "Head teacher decision",
      overrideIneligible: true,
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)

    const transition = await prisma.studentTransition.findFirst({
      where: { studentId, toClassTermId },
      orderBy: { createdAt: "desc" },
      select: { notes: true },
    })
    // The override has to survive on the permanent record, not just the moment.
    expect(transition?.notes).toContain("Head teacher decision")
    expect(transition?.notes).toContain("policy overridden for")
  })

  it("blocks on the academic bar independently of publication", async () => {
    await resetToStart()
    expect(
      (
        await saveTransitionPolicy({
          requireResultsPublished: false,
          usePromotionCriteria: true,
          minAverage: 50,
        })
      ).success,
    ).toBe(true)

    const cohort = await classCohort()
    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: cohort,
      transitionType: "PROMOTION",
    })

    // No marks recorded, so nobody can be measured against the bar.
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/promotion policy/i)
  })

  it("leaves transfers and withdrawals alone — the policy governs promotion only", async () => {
    await resetToStart()
    // The strictest possible policy is still in force from the test above.
    const result = await executeStudentTransitions({
      fromClassTermId,
      toClassTermId,
      studentIds: [studentId],
      transitionType: "TRANSFER",
      notes: "Moved arm mid-term",
    })
    expect(result.success, result.success ? "" : result.error).toBe(true)
  })
})

describe("who may set the promotion rules", () => {
  // Real staff accounts with only the permissions under test: a registrar who runs
  // transitions, and an Exams Officer who sets policy. The admin above holds both.
  const STAMP = `ZZPolicy${Date.now()}`
  const made = { userIds: [] as string[], profileIds: [] as string[] }
  let registrarId = ""
  let examsOfficerId = ""
  let adminId = ""

  async function staffWith(name: string, permissions: string[]) {
    const user = await prisma.user.create({ data: { firstName: `${STAMP}${name}`, lastName: "Staff", role: "TEACHER" }, select: { id: true } })
    made.userIds.push(user.id)
    await prisma.teacher.create({ data: { userId: user.id, schoolId, staffId: `${STAMP}-${name}` } })
    const profile = await prisma.permissionProfile.create({
      data: { schoolId, code: `${STAMP}_${name}`.toUpperCase(), name: `${STAMP} ${name}`, permissions },
      select: { id: true },
    })
    made.profileIds.push(profile.id)
    await prisma.userPermissionProfile.create({ data: { userId: user.id, schoolId, profileId: profile.id } })
    return user.id
  }

  const actAs = (id: string) => vi.mocked(auth).mockResolvedValue({
    user: { id, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  beforeAll(async () => {
    adminId = (await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN", isActive: true, admin: { schoolId } }, select: { id: true },
    })).id
    registrarId = await staffWith("Registrar", ["students.manage"])
    examsOfficerId = await staffWith("Exams", ["academics.manage", "compiler.configure_policy"])
  })

  afterAll(async () => {
    actAs(adminId)
    await prisma.userPermissionProfile.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.permissionProfile.deleteMany({ where: { id: { in: made.profileIds } } })
    await prisma.teacher.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: made.userIds } } })
  })

  it("lets the Exams Officer read and save them", async () => {
    actAs(examsOfficerId)
    expect((await getTransitionPolicy()).success).toBe(true)
    expect(await saveTransitionPolicy({ requireResultsPublished: true, usePromotionCriteria: false })).toEqual({ success: true })
  })

  it("lets a registrar read them, since transitions are judged by them, but not change them", async () => {
    actAs(registrarId)
    expect((await getTransitionPolicy()).success).toBe(true)
    const saved = await saveTransitionPolicy({ requireResultsPublished: false, usePromotionCriteria: false })
    expect(saved.success).toBe(false)
    expect(saved.error).toMatch(/compiler\.configure_policy/)
    expect((await prisma.transitionPolicy.findUniqueOrThrow({ where: { schoolId } })).requireResultsPublished).toBe(true)
  })
})
