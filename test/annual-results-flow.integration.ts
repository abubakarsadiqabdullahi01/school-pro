import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * End-of-session decisions, against a real school's marks.
 *
 * `lib/promotion-policy.test.ts` proves the rules in isolation. This proves the things only
 * a database and a real class can settle:
 *
 *  - A **credit is not a pass.** The whole point of the new rule is that it is stricter,
 *    and the test that matters is the one where the same learner clears one bar and not the
 *    other on identical marks.
 *  - **Compiling writes nothing.** An exams officer must be able to see who would be held
 *    back before anything reaches a record a parent will eventually read.
 *  - **Only an approved decision reaches a report card.** `buildSessionClassReport` feeds
 *    the parent and student portals, so an unapproved "Repeat" leaking into it would tell a
 *    family something the school has not decided.
 *  - **Recompiling does not withdraw an approval**, and an override against the rules needs
 *    a reason — or is refused outright where the class forbids one.
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
const { buildSessionClassReport } = await import("@/lib/results/session-report.server")
const {
  approveAnnualDecisions,
  clearClassPromotionPolicy,
  computeAnnualDecisions,
  getClassPromotionPolicies,
  saveAnnualDecisions,
  saveClassPromotionPolicy,
  setAnnualDecision,
  withdrawAnnualApproval,
} = await import("@/app/actions/annual-results")

let schoolId = ""
let classId = ""
let sessionId = ""
/** The highest subject mark anywhere in the class, used to place bars either side of it. */
let topSubjectScore = 0

/** A policy body with everything off except what a test switches on. */
function policy(overrides: Record<string, unknown> = {}) {
  return {
    classId,
    requireResultsPublished: false,
    usePromotionCriteria: true,
    minAverage: null,
    minSubjectsPassed: null,
    minCreditsRequired: null,
    creditMark: 50,
    evaluationScope: "SESSION_AVERAGE" as const,
    requiredSubjectIds: [],
    minCoreSubjectsPassed: null,
    requireAllSubjectsEntered: false,
    allowManualOverride: true,
    isGraduatingClass: false,
    ...overrides,
  }
}

async function clearDecisions() {
  await prisma.annualResultDecision.deleteMany({ where: { classId, sessionId } })
}

/**
 * A learner enrolled in the class who has no usable mark anywhere in the session.
 *
 * Real class lists contain them, and they are never promoted however low the bar is set —
 * there is nothing to judge them on. Tests about *the bar* have to exclude them or they
 * would be asserting the wrong thing.
 */
function hasNoResults(row: { reasons: string[] }): boolean {
  return row.reasons.some((reason) => reason.includes("No results recorded"))
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to act as")
  schoolId = admin.admin.schoolId

  vi.mocked(auth).mockResolvedValue({
    user: { id: admin.id, sessionRecordId: null },
  } as unknown as Awaited<ReturnType<typeof auth>>)

  // Find any class and session that actually produced released results. Hunting for one
  // rather than hardcoding keeps this working against whatever the database happens to
  // hold, which is the point of running it against a real one.
  const [classes, sessions] = await Promise.all([
    prisma.class.findMany({ where: { schoolId }, select: { id: true } }),
    prisma.session.findMany({ where: { schoolId }, select: { id: true } }),
  ])

  outer: for (const session of sessions) {
    for (const klass of classes) {
      const report = await buildSessionClassReport(klass.id, session.id, schoolId)
      if (report && report.students.length >= 2 && report.subjects.length >= 2) {
        classId = klass.id
        sessionId = session.id
        topSubjectScore = Math.max(
          ...report.students.flatMap((student) =>
            Object.values(student.subjects)
              .map((subject) => subject.score)
              .filter((score): score is number => score !== null),
          ),
        )
        break outer
      }
    }
  }

  if (!classId) throw new Error("No class with released sessional results to decide on")
})

afterAll(async () => {
  await clearDecisions()
  await prisma.classPromotionPolicy.deleteMany({ where: { classId } })
})

beforeEach(async () => {
  await clearDecisions()
  await prisma.classPromotionPolicy.deleteMany({ where: { classId } })
})

// ---------------------------------------------------------------------------
// Per-class rules
// ---------------------------------------------------------------------------

describe("per-class rules", () => {
  it("inherits the school default until a class is deliberately overridden", async () => {
    const listed = await getClassPromotionPolicies()
    expect(listed.success).toBe(true)

    const row = listed.success ? listed.data.find((entry) => entry.classId === classId) : undefined
    expect(row).toBeDefined()
    expect(row!.hasOverride).toBe(false)
    expect(row!.summary).toContain("School default")
  })

  it("reports a class as having its own rules once one is saved", async () => {
    await saveClassPromotionPolicy(policy({ minAverage: 50 }))

    const listed = await getClassPromotionPolicies()
    const row = listed.success ? listed.data.find((entry) => entry.classId === classId) : undefined
    expect(row!.hasOverride).toBe(true)
    expect(row!.summary).toContain("Own rules")
  })

  it("refuses to switch the bar on with nothing set", async () => {
    // It would silently promote everybody, which is not what turning it on means.
    const result = await saveClassPromotionPolicy(policy())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("before turning the criteria on")
  })

  it("refuses a core-subject rule with no core subjects chosen", async () => {
    const result = await saveClassPromotionPolicy(
      policy({ minCoreSubjectsPassed: 2, requiredSubjectIds: [] }),
    )
    expect(result.success).toBe(false)
  })

  it("returns a class to the school default", async () => {
    await saveClassPromotionPolicy(policy({ minAverage: 50 }))
    await clearClassPromotionPolicy(classId)

    const listed = await getClassPromotionPolicies()
    const row = listed.success ? listed.data.find((entry) => entry.classId === classId) : undefined
    expect(row!.hasOverride).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The distinction the whole feature exists for
// ---------------------------------------------------------------------------

describe("a credit is not a pass", () => {
  it("counts fewer credits than passes when the credit mark is above the marks", async () => {
    // Put the credit bar above every mark in the class. Everybody still passes subjects
    // against the grading pass mark; nobody earns a credit. Conflating the two rules —
    // which is what a school asking for "six credits" used to get — would show these equal.
    await saveClassPromotionPolicy(
      policy({ minCreditsRequired: 1, creditMark: Math.min(100, topSubjectScore + 1) }),
    )

    const computed = await computeAnnualDecisions(classId, sessionId)
    expect(computed.success).toBe(true)
    if (!computed.success) return

    const withPasses = computed.data.rows.filter((row) => row.subjectsPassed > 0)
    expect(withPasses.length).toBeGreaterThan(0)
    for (const row of withPasses) {
      expect(row.creditsEarned).toBe(0)
      expect(row.decision).toBe("REPEATED")
      expect(row.reasons.join(" ")).toContain("credit")
    }
  })

  it("promotes the same learners when the credit bar is reachable", async () => {
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 0, creditMark: 50 }))

    const computed = await computeAnnualDecisions(classId, sessionId)
    expect(computed.success).toBe(true)
    if (!computed.success) return

    const withResults = computed.data.rows.filter((row) => !hasNoResults(row))
    expect(withResults.length).toBeGreaterThan(0)
    expect(withResults.every((row) => row.decision === "PROMOTED")).toBe(true)
  })

  it("does not promote a learner with no marks at all, whatever the bar", async () => {
    // Enrolled but never assessed. Passing somebody on an average of zero would be worse
    // than saying there is nothing to judge them on, so the rules refuse rather than wave
    // them through — even with the bar set as low as it goes.
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 0, creditMark: 50 }))

    const computed = await computeAnnualDecisions(classId, sessionId)
    if (!computed.success) return

    for (const row of computed.data.rows.filter(hasNoResults)) {
      expect(row.decision).toBe("REPEATED")
    }
  })

  it("describes the rule in words an admin can check", async () => {
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 5, creditMark: 50 }))
    const computed = await computeAnnualDecisions(classId, sessionId)
    expect(computed.success).toBe(true)
    if (computed.success) {
      expect(computed.data.policySummary).toContain("5 credits at 50%")
    }
  })
})

describe("a final year graduates rather than being promoted", () => {
  it("labels a successful finalist GRADUATED", async () => {
    await saveClassPromotionPolicy(
      policy({ minCreditsRequired: 0, creditMark: 50, isGraduatingClass: true }),
    )

    const computed = await computeAnnualDecisions(classId, sessionId)
    expect(computed.success).toBe(true)
    if (computed.success) {
      const withResults = computed.data.rows.filter((row) => !hasNoResults(row))
      expect(withResults.length).toBeGreaterThan(0)
      expect(withResults.every((row) => row.decision === "GRADUATED")).toBe(true)
    }
  })

  it("still repeats a finalist who missed the bar", async () => {
    await saveClassPromotionPolicy(
      policy({
        minCreditsRequired: 1,
        creditMark: Math.min(100, topSubjectScore + 1),
        isGraduatingClass: true,
      }),
    )

    const computed = await computeAnnualDecisions(classId, sessionId)
    if (computed.success) {
      expect(computed.data.rows.every((row) => row.decision === "REPEATED")).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Compile, save, approve
// ---------------------------------------------------------------------------

describe("compiling writes nothing", () => {
  it("leaves no decision rows behind", async () => {
    await saveClassPromotionPolicy(policy({ minAverage: 40 }))
    await computeAnnualDecisions(classId, sessionId)

    const stored = await prisma.annualResultDecision.count({ where: { classId, sessionId } })
    expect(stored).toBe(0)
  })
})

describe("saving freezes the decision", () => {
  beforeEach(async () => {
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 0, creditMark: 50 }))
  })

  it("records one row per learner with the figures it judged", async () => {
    const saved = await saveAnnualDecisions({ classId, sessionId })
    expect(saved.success).toBe(true)

    const rows = await prisma.annualResultDecision.findMany({
      where: { classId, sessionId },
      select: {
        decision: true,
        sessionAverage: true,
        subjectsOffered: true,
        subjectsPassed: true,
        creditsEarned: true,
        policyBasis: true,
        reasons: true,
        decidedAt: true,
        approvedAt: true,
        principalComment: true,
      },
    })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((row) => row.decision === "PROMOTED")).toBe(true)
    for (const row of rows) {
      // Every learner with something to judge clears a bar of zero credits; the rest are
      // the never-assessed, who are held back rather than waved through.
      const reasons = Array.isArray(row.reasons) ? (row.reasons as string[]) : []
      expect(row.decision).toBe(reasons.length === 0 ? "PROMOTED" : "REPEATED")
      expect(row.decidedAt).not.toBeNull()
      // Not approved by saving. Deciding and approving are separate acts.
      expect(row.approvedAt).toBeNull()
      // The rule is copied in, so editing the class policy later cannot restate this.
      expect(row.policyBasis).not.toBeNull()
      expect(row.subjectsOffered).toBeGreaterThan(0)
      // A suggested comment rather than an empty card.
      expect(row.principalComment ?? "").not.toBe("")
    }
  })

  it("keeps the frozen figures when the class policy is changed afterwards", async () => {
    await saveAnnualDecisions({ classId, sessionId })
    const before = await prisma.annualResultDecision.findFirstOrThrow({
      where: { classId, sessionId },
      select: { id: true, policyBasis: true, decision: true },
    })

    await saveClassPromotionPolicy(
      policy({ minCreditsRequired: 1, creditMark: Math.min(100, topSubjectScore + 1) }),
    )

    const after = await prisma.annualResultDecision.findUniqueOrThrow({
      where: { id: before.id },
      select: { policyBasis: true, decision: true },
    })
    expect(after.decision).toBe(before.decision)
    expect(JSON.stringify(after.policyBasis)).toBe(JSON.stringify(before.policyBasis))
  })
})

describe("only an approved decision reaches a report card", () => {
  beforeEach(async () => {
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 0, creditMark: 50 }))
    await saveAnnualDecisions({ classId, sessionId })
  })

  it("is absent from the session report while unapproved", async () => {
    // This builder feeds the parent and student portals. A family must not be shown an
    // outcome the principal has not signed off.
    const report = await buildSessionClassReport(classId, sessionId, schoolId)
    expect(report!.students.every((student) => student.annualDecision === "PENDING")).toBe(true)
    expect(report!.students.every((student) => student.principalComment === "")).toBe(true)
  })

  it("appears once approved", async () => {
    const approved = await approveAnnualDecisions(classId, sessionId)
    expect(approved.success).toBe(true)

    const report = await buildSessionClassReport(classId, sessionId, schoolId)
    // Nobody is left PENDING once the class is approved, and the learners who cleared the
    // bar carry PROMOTED onto their card.
    expect(report!.students.every((student) => student.annualDecision !== "PENDING")).toBe(true)
    expect(report!.students.some((student) => student.annualDecision === "PROMOTED")).toBe(true)
    expect(report!.students.some((student) => student.principalComment.length > 0)).toBe(true)
  })

  it("disappears again when the approval is withdrawn", async () => {
    await approveAnnualDecisions(classId, sessionId)
    const withdrawn = await withdrawAnnualApproval(classId, sessionId, "Marks were re-checked")
    expect(withdrawn.success).toBe(true)

    const report = await buildSessionClassReport(classId, sessionId, schoolId)
    expect(report!.students.every((student) => student.annualDecision === "PENDING")).toBe(true)
  })

  it("refuses to approve when there is nothing to approve", async () => {
    await approveAnnualDecisions(classId, sessionId)
    const again = await approveAnnualDecisions(classId, sessionId)
    expect(again.success).toBe(false)
  })

  it("does not withdraw an approval when the class is compiled again", async () => {
    await approveAnnualDecisions(classId, sessionId)

    const resaved = await saveAnnualDecisions({ classId, sessionId })
    expect(resaved.success).toBe(true)
    if (resaved.success) {
      expect(resaved.data.saved).toBe(0)
      expect(resaved.data.skippedApproved).toBeGreaterThan(0)
    }

    const stillApproved = await prisma.annualResultDecision.count({
      where: { classId, sessionId, approvedAt: { not: null } },
    })
    expect(stillApproved).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

describe("overrides", () => {
  beforeEach(async () => {
    await saveClassPromotionPolicy(policy({ minCreditsRequired: 0, creditMark: 50 }))
    await saveAnnualDecisions({ classId, sessionId })
  })

  /**
   * A learner the rules *promoted*.
   *
   * Deliberately not "any learner": a class list contains learners with no marks, whom the
   * rules already repeat. Choosing one of those would make "set them to REPEATED" agree
   * with the rules rather than contradict them, and these tests are about contradiction.
   */
  async function promotedStudentId() {
    const row = await prisma.annualResultDecision.findFirstOrThrow({
      where: { classId, sessionId, decision: "PROMOTED" },
      orderBy: { studentId: "asc" },
      select: { studentId: true },
    })
    return row.studentId
  }

  it("demands a reason when the chosen outcome contradicts the rules", async () => {
    const studentId = await promotedStudentId()

    const result = await setAnnualDecision({ studentId, sessionId, decision: "REPEATED" })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("Give a reason")
  })

  it("accepts a contradicting outcome with a reason, and records it as an override", async () => {
    const studentId = await promotedStudentId()

    const result = await setAnnualDecision({
      studentId,
      sessionId,
      decision: "REPEATED",
      overrideReason: "Sat the exams under investigation",
    })
    expect(result.success).toBe(true)

    const row = await prisma.annualResultDecision.findFirstOrThrow({
      where: { studentId, sessionId },
      select: { decision: true, isOverride: true, overrideReason: true },
    })
    expect(row.decision).toBe("REPEATED")
    expect(row.isOverride).toBe(true)
    expect(row.overrideReason).toContain("investigation")
  })

  it("survives a recompile rather than being quietly undone", async () => {
    const studentId = await promotedStudentId()
    await setAnnualDecision({
      studentId,
      sessionId,
      decision: "REPEATED",
      overrideReason: "Sat the exams under investigation",
    })

    const recomputed = await computeAnnualDecisions(classId, sessionId)
    expect(recomputed.success).toBe(true)
    if (recomputed.success) {
      const row = recomputed.data.rows.find((entry) => entry.studentId === studentId)
      expect(row!.decision).toBe("REPEATED")
      expect(row!.isOverride).toBe(true)
    }
  })

  it("is refused outright where the class forbids overrides", async () => {
    await saveClassPromotionPolicy(
      policy({ minCreditsRequired: 0, creditMark: 50, allowManualOverride: false }),
    )
    const studentId = await promotedStudentId()

    const result = await setAnnualDecision({
      studentId,
      sessionId,
      decision: "REPEATED",
      overrideReason: "A reason that should not be enough",
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("does not allow manual overrides")
  })

  it("cannot change a decision that has already been approved", async () => {
    await approveAnnualDecisions(classId, sessionId)
    const studentId = await promotedStudentId()

    const result = await setAnnualDecision({
      studentId,
      sessionId,
      decision: "REPEATED",
      overrideReason: "Too late",
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain("Withdraw the approval")
  })

  it("does not mark an override when the choice agrees with the rules", async () => {
    const studentId = await promotedStudentId()

    const result = await setAnnualDecision({
      studentId,
      sessionId,
      decision: "PROMOTED",
      principalComment: "A steady year.",
    })
    expect(result.success).toBe(true)

    const row = await prisma.annualResultDecision.findFirstOrThrow({
      where: { studentId, sessionId },
      select: { isOverride: true, overrideReason: true, principalComment: true },
    })
    expect(row.isOverride).toBe(false)
    expect(row.overrideReason).toBeNull()
    expect(row.principalComment).toBe("A steady year.")
  })
})
