"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { AuthorizationError, assertSchoolAccess, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import {
  decisionLabel,
  evaluateAnnualOutcome,
  resolvePolicyForClass,
  suggestedPrincipalComment,
  type AnnualDecision,
  type ClassPolicyOverride,
} from "@/lib/promotion-policy"
import { DEFAULT_PROMOTION_POLICY, type PromotionPolicy, type StudentResultSummary } from "@/lib/promotion"
import { buildSessionClassReport } from "@/lib/results/session-report.server"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * End-of-session outcomes: per-class promotion rules, and the decision the annual card prints.
 *
 * The Word document asked for "Promotion or Repeated as Principal Comment", plus somewhere
 * to configure, per class, whether promotion goes on the three-term average or on a count
 * of credits. That turned into three separate things, and keeping them separate is the
 * whole design:
 *
 *  1. **The rule** — `ClassPromotionPolicy`, overriding the school's `TransitionPolicy`.
 *  2. **The decision** — a status: PROMOTED, REPEATED, GRADUATED or PENDING.
 *  3. **The comment** — the principal's own words, stored beside the status, never parsed
 *     back into it.
 *
 * And two acts, not one: an exams officer *computes*, a principal *approves*. Only an
 * approved decision reaches a report card. A card that printed "Promoted" the moment
 * somebody pressed compile would be a promise the school had not made yet.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function toError(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    const [issue] = error.issues
    return { success: false, error: issue?.message ?? fallback }
  }
  console.error(fallback, error)
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

async function actorSchool(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId
  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }
  throw new AuthorizationError("Select a school first")
}

function revalidateResults() {
  revalidatePath("/dashboard/admin/compiler/class-results/sessional")
  revalidatePath("/dashboard/admin/compiler/annual-results")
  revalidatePath("/dashboard/admin/compiler/student-transitions")
  revalidatePath("/dashboard/admin/school-settings")
}

// ---------------------------------------------------------------------------
// Policy loading
// ---------------------------------------------------------------------------

/** The school-wide default, in the pure shape the rules use. */
async function schoolPolicy(schoolId: string): Promise<PromotionPolicy> {
  const stored = await prisma.transitionPolicy.findUnique({ where: { schoolId } })
  if (!stored) return DEFAULT_PROMOTION_POLICY

  return {
    requireResultsPublished: stored.requireResultsPublished,
    usePromotionCriteria: stored.usePromotionCriteria,
    minAverage: stored.promotionMinAverage ? Number(stored.promotionMinAverage) : null,
    minSubjectsPassed: stored.minSubjectsPassed,
    minCreditsRequired: stored.minCreditsRequired,
    creditMark: Number(stored.creditMark),
    evaluationScope: stored.evaluationScope,
    requiredSubjectIds: Array.isArray(stored.requiredSubjectIds)
      ? stored.requiredSubjectIds.map(String)
      : [],
    minCoreSubjectsPassed: stored.minCoreSubjectsPassed,
    requireAllSubjectsEntered: stored.requireAllSubjectsEntered,
    allowManualOverride: stored.allowManualOverride,
    isGraduatingClass: false,
  }
}

/**
 * A class override in the shape `resolvePolicyForClass` expects.
 *
 * Note what is *not* done here: a stored null is passed through as null, which means
 * "overridden to off", while a field the class does not express stays undefined and
 * inherits. The columns are all nullable, so every stored row expresses every field —
 * which is a limitation worth naming. A class override is currently whole-policy, not
 * field-by-field; `overriddenFields` on the resolved result reports it honestly as such.
 */
function overrideFromRow(row: {
  requireResultsPublished: boolean
  usePromotionCriteria: boolean
  promotionMinAverage: unknown
  minSubjectsPassed: number | null
  minCreditsRequired: number | null
  creditMark: unknown
  evaluationScope: "TERM" | "SESSION_AVERAGE"
  requiredSubjectIds: unknown
  minCoreSubjectsPassed: number | null
  requireAllSubjectsEntered: boolean
  allowManualOverride: boolean
  isGraduatingClass: boolean
}): ClassPolicyOverride {
  return {
    requireResultsPublished: row.requireResultsPublished,
    usePromotionCriteria: row.usePromotionCriteria,
    minAverage: row.promotionMinAverage == null ? null : Number(row.promotionMinAverage),
    minSubjectsPassed: row.minSubjectsPassed,
    minCreditsRequired: row.minCreditsRequired,
    creditMark: Number(row.creditMark),
    evaluationScope: row.evaluationScope,
    requiredSubjectIds: Array.isArray(row.requiredSubjectIds)
      ? row.requiredSubjectIds.map(String)
      : [],
    minCoreSubjectsPassed: row.minCoreSubjectsPassed,
    requireAllSubjectsEntered: row.requireAllSubjectsEntered,
    allowManualOverride: row.allowManualOverride,
    isGraduatingClass: row.isGraduatingClass,
  }
}

/** The rules that actually apply to one class. */
export async function resolvedPolicyFor(schoolId: string, classId: string) {
  const [school, override] = await Promise.all([
    schoolPolicy(schoolId),
    prisma.classPromotionPolicy.findUnique({ where: { classId } }),
  ])
  return resolvePolicyForClass(school, override ? overrideFromRow(override) : null)
}

// ---------------------------------------------------------------------------
// Per-class policy configuration
// ---------------------------------------------------------------------------

export type ClassPolicyRow = {
  classId: string
  className: string
  level: string
  hasOverride: boolean
  isGraduatingClass: boolean
  summary: string
}

/** Every class and whether it promotes on its own rules. The configuration screen's list. */
export async function getClassPromotionPolicies(): Promise<ActionResult<ClassPolicyRow[]>> {
  try {
    const actor = await requirePermission("compiler.configure_policy")
    const schoolId = await actorSchool(actor)

    const [classes, overrides, school] = await Promise.all([
      prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, level: true },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      }),
      prisma.classPromotionPolicy.findMany({ where: { schoolId } }),
      schoolPolicy(schoolId),
    ])

    const byClass = new Map(overrides.map((row) => [row.classId, row]))

    return {
      success: true,
      data: classes.map((classRow) => {
        const override = byClass.get(classRow.id)
        const resolved = resolvePolicyForClass(school, override ? overrideFromRow(override) : null)
        return {
          classId: classRow.id,
          className: classRow.name,
          level: classRow.level,
          hasOverride: Boolean(override),
          isGraduatingClass: resolved.policy.isGraduatingClass,
          summary: describePolicy(resolved.policy, Boolean(override)),
        }
      }),
    }
  } catch (error) {
    return toError(error, "Failed to load the class promotion policies")
  }
}

/** A one-line description of what a policy actually requires. */
function describePolicy(policy: PromotionPolicy, hasOverride: boolean): string {
  const source = hasOverride ? "Own rules" : "School default"
  if (!policy.usePromotionCriteria) return `${source} — no academic bar`

  const parts: string[] = []
  if (policy.minAverage != null) parts.push(`average ${policy.minAverage}%`)
  if (policy.minSubjectsPassed != null) parts.push(`${policy.minSubjectsPassed} passes`)
  if (policy.minCreditsRequired != null) {
    parts.push(`${policy.minCreditsRequired} credits at ${policy.creditMark}%`)
  }
  if (policy.minCoreSubjectsPassed != null) parts.push(`${policy.minCoreSubjectsPassed} core`)
  if (parts.length === 0) parts.push("no minimum set")

  const scope = policy.evaluationScope === "SESSION_AVERAGE" ? "session average" : "final term"
  const graduating = policy.isGraduatingClass ? ", graduating year" : ""
  return `${source} — ${parts.join(", ")} on ${scope}${graduating}`
}

export type ClassPolicyDetail = {
  classId: string
  className: string
  hasOverride: boolean
  policy: PromotionPolicy
  schoolDefault: PromotionPolicy
  subjects: Array<{ id: string; name: string; code: string }>
}

export async function getClassPromotionPolicy(
  classId: string,
): Promise<ActionResult<ClassPolicyDetail>> {
  try {
    const actor = await requirePermission("compiler.configure_policy")
    const schoolId = await actorSchool(actor)

    const classRow = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        schoolId: true,
        subjects: { select: { subject: { select: { id: true, name: true, code: true } } } },
      },
    })
    if (!classRow) throw new Error("Class not found")
    assertSchoolAccess(actor, classRow.schoolId)

    const [resolved, school, override] = await Promise.all([
      resolvedPolicyFor(schoolId, classId),
      schoolPolicy(schoolId),
      prisma.classPromotionPolicy.findUnique({ where: { classId }, select: { id: true } }),
    ])

    return {
      success: true,
      data: {
        classId: classRow.id,
        className: classRow.name,
        hasOverride: Boolean(override),
        policy: resolved.policy,
        schoolDefault: school,
        subjects: classRow.subjects.map((row) => row.subject),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load that class promotion policy")
  }
}

const classPolicySchema = z.object({
  classId: z.string().min(1),
  requireResultsPublished: z.coerce.boolean(),
  usePromotionCriteria: z.coerce.boolean(),
  minAverage: z.coerce.number().min(0).max(100).nullable().optional(),
  minSubjectsPassed: z.coerce.number().int().min(0).max(50).nullable().optional(),
  minCreditsRequired: z.coerce.number().int().min(0).max(50).nullable().optional(),
  creditMark: z.coerce.number().min(0).max(100).default(50),
  evaluationScope: z.enum(["TERM", "SESSION_AVERAGE"]).default("SESSION_AVERAGE"),
  requiredSubjectIds: z.array(z.string().min(1)).default([]),
  minCoreSubjectsPassed: z.coerce.number().int().min(0).max(50).nullable().optional(),
  requireAllSubjectsEntered: z.coerce.boolean().default(false),
  allowManualOverride: z.coerce.boolean().default(true),
  isGraduatingClass: z.coerce.boolean().default(false),
})

export async function saveClassPromotionPolicy(input: unknown): Promise<ActionResult<{ classId: string }>> {
  try {
    const actor = await requirePermission("compiler.configure_policy")
    const schoolId = await actorSchool(actor)
    const data = classPolicySchema.parse(input)

    const classRow = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { schoolId: true, name: true },
    })
    if (!classRow) throw new Error("Class not found")
    assertSchoolAccess(actor, classRow.schoolId)
    if (classRow.schoolId !== schoolId) throw new AuthorizationError("That class is in another school")

    // The same guard the school-wide policy has: switching the bar on while setting no bar
    // would silently promote everybody, which is not what turning it on is meant to mean.
    if (
      data.usePromotionCriteria &&
      data.minAverage == null &&
      data.minSubjectsPassed == null &&
      data.minCreditsRequired == null &&
      data.minCoreSubjectsPassed == null &&
      !data.requireAllSubjectsEntered
    ) {
      throw new Error(
        "Set a minimum average, subjects passed, credits, core subjects, or missing-subject rule before turning the criteria on",
      )
    }
    if (data.minCoreSubjectsPassed != null && data.requiredSubjectIds.length === 0) {
      throw new Error("Choose the core subjects before setting a core-subject rule")
    }

    const row = {
      requireResultsPublished: data.requireResultsPublished,
      usePromotionCriteria: data.usePromotionCriteria,
      promotionMinAverage: data.minAverage ?? null,
      minSubjectsPassed: data.minSubjectsPassed ?? null,
      minCreditsRequired: data.minCreditsRequired ?? null,
      creditMark: data.creditMark,
      evaluationScope: data.evaluationScope,
      requiredSubjectIds: data.requiredSubjectIds,
      minCoreSubjectsPassed: data.minCoreSubjectsPassed ?? null,
      requireAllSubjectsEntered: data.requireAllSubjectsEntered,
      allowManualOverride: data.allowManualOverride,
      isGraduatingClass: data.isGraduatingClass,
    }

    await prisma.classPromotionPolicy.upsert({
      where: { classId: data.classId },
      create: { classId: data.classId, schoolId, ...row },
      update: row,
    })

    await recordAudit({
      actor,
      action: "promotion.class_policy_save",
      entityType: "ClassPromotionPolicy",
      entityId: data.classId,
      summary: `Promotion rules set for ${classRow.name}`,
      after: row,
    })

    revalidateResults()
    return { success: true, data: { classId: data.classId } }
  } catch (error) {
    return toError(error, "Failed to save that class promotion policy")
  }
}

/** Drops a class back to the school default. */
export async function clearClassPromotionPolicy(classId: string): Promise<ActionResult<{ classId: string }>> {
  try {
    const actor = await requirePermission("compiler.configure_policy")
    const classRow = await prisma.class.findUnique({
      where: { id: classId },
      select: { schoolId: true, name: true },
    })
    if (!classRow) throw new Error("Class not found")
    assertSchoolAccess(actor, classRow.schoolId)

    await prisma.classPromotionPolicy.deleteMany({ where: { classId } })

    await recordAudit({
      actor,
      action: "promotion.class_policy_clear",
      entityType: "ClassPromotionPolicy",
      entityId: classId,
      summary: `${classRow.name} returned to the school promotion default`,
    })

    revalidateResults()
    return { success: true, data: { classId } }
  } catch (error) {
    return toError(error, "Failed to clear that class promotion policy")
  }
}

// ---------------------------------------------------------------------------
// Evaluating a session
// ---------------------------------------------------------------------------

export type AnnualDecisionRow = {
  studentId: string
  studentName: string
  admissionNo: string
  decision: AnnualDecision
  decisionText: string
  principalComment: string
  suggestedComment: string
  sessionAverage: number
  subjectsOffered: number
  subjectsPassed: number
  creditsEarned: number
  termsCounted: number
  reasons: string[]
  isOverride: boolean
  overrideReason: string | null
  /** Set once saved. */
  savedAt: string | null
  approvedAt: string | null
}

/**
 * Turns a session report into the summaries the promotion rules expect.
 *
 * `buildSessionClassReport` already computes each learner's per-subject and overall session
 * marks, so this maps rather than recomputes — one definition of what a session average is,
 * shared by the card and by the rule that reads it.
 */
function summariesFrom(
  report: NonNullable<Awaited<ReturnType<typeof buildSessionClassReport>>>,
  hasUnpublished: Set<string>,
): StudentResultSummary[] {
  const passMark = report.gradingSystem.passMark

  return report.students.map((student) => {
    const subjectResults = report.subjects
      .map((subject) => {
        const result = student.subjects[subject.id]
        if (!result || result.score === null) return null
        return { subjectId: subject.id, passed: result.score >= passMark, score: result.score }
      })
      .filter((entry): entry is { subjectId: string; passed: boolean; score: number } => entry !== null)

    const missingSubjectIds = report.subjects
      .filter((subject) => {
        const result = student.subjects[subject.id]
        return !result || result.score === null
      })
      .map((subject) => subject.id)

    return {
      studentId: student.studentId,
      name: student.studentName,
      subjectCount: subjectResults.length,
      averageScore: student.averageScore,
      passedSubjects: subjectResults.filter((entry) => entry.passed).length,
      hasUnpublishedResults: hasUnpublished.has(student.studentId),
      missingSubjectIds,
      subjectResults,
    }
  })
}

/**
 * Which learners still have an unreleased mark somewhere in the session.
 *
 * The session report reads published rows only, so it cannot answer this — from its point
 * of view an unpublished subject is simply absent. `requireResultsPublished` needs to know
 * the difference between "not taught" and "not released yet", so it is asked separately.
 */
async function unpublishedStudents(studentIds: string[], sessionId: string): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set()
  const rows = await prisma.assessment.findMany({
    where: {
      studentId: { in: studentIds },
      term: { sessionId },
      isPublished: false,
    },
    select: { studentId: true },
    distinct: ["studentId"],
  })
  return new Set(rows.map((row) => row.studentId))
}

/**
 * Evaluates a class's session against its policy. Writes nothing.
 *
 * Separate from saving on purpose: an exams officer should be able to look at what the
 * rules say — and at who it would hold back — before committing anything to a record a
 * parent will eventually read.
 */
export async function computeAnnualDecisions(
  classId: string,
  sessionId: string,
): Promise<ActionResult<{ rows: AnnualDecisionRow[]; policySummary: string; className: string }>> {
  try {
    const actor = await requirePermission("compiler.review_results")
    const schoolId = await actorSchool(actor)

    const [report, resolved, existing] = await Promise.all([
      buildSessionClassReport(classId, sessionId, schoolId),
      resolvedPolicyFor(schoolId, classId),
      prisma.annualResultDecision.findMany({ where: { classId, sessionId } }),
    ])

    if (!report) {
      return { success: false, error: "That class did not run in that session." }
    }

    const hasUnpublished = await unpublishedStudents(
      report.students.map((student) => student.studentId),
      sessionId,
    )
    const summaries = summariesFrom(report, hasUnpublished)
    const saved = new Map(existing.map((row) => [row.studentId, row]))

    const rows: AnnualDecisionRow[] = summaries.map((summary) => {
      const { verdict, decision } = evaluateAnnualOutcome(summary, resolved.policy)
      const savedRow = saved.get(summary.studentId)
      const student = report.students.find((entry) => entry.studentId === summary.studentId)!

      // A saved override wins over a recomputation. Somebody decided this deliberately and
      // pressing compile again must not quietly undo them.
      const effective: AnnualDecision = savedRow?.isOverride
        ? (savedRow.decision as AnnualDecision)
        : decision

      return {
        studentId: summary.studentId,
        studentName: summary.name,
        admissionNo: student.admissionNo,
        decision: effective,
        decisionText: decisionLabel(effective),
        principalComment: savedRow?.principalComment ?? "",
        suggestedComment: suggestedPrincipalComment(effective, summary.averageScore),
        sessionAverage: Math.round(summary.averageScore * 100) / 100,
        subjectsOffered: report.subjects.length,
        subjectsPassed: summary.passedSubjects,
        creditsEarned: verdict.creditsEarned,
        termsCounted: student.termsCounted,
        reasons: verdict.reasons,
        isOverride: savedRow?.isOverride ?? false,
        overrideReason: savedRow?.overrideReason ?? null,
        savedAt: savedRow?.decidedAt?.toISOString() ?? null,
        approvedAt: savedRow?.approvedAt?.toISOString() ?? null,
      }
    })

    return {
      success: true,
      data: {
        rows,
        className: report.className,
        policySummary: describePolicy(resolved.policy, resolved.source === "CLASS_OVERRIDE"),
      },
    }
  } catch (error) {
    return toError(error, "Failed to work out this session's decisions")
  }
}

const saveSchema = z.object({
  classId: z.string().min(1),
  sessionId: z.string().min(1),
  comments: z
    .array(z.object({ studentId: z.string().min(1), principalComment: z.string().trim().max(600) }))
    .default([]),
  /** Fill blank comments with the suggested wording rather than leaving the card empty. */
  useSuggestedComments: z.coerce.boolean().default(true),
})

/**
 * Freezes this session's decisions.
 *
 * Everything the rule looked at is copied onto the row — the average, the counts, the
 * reasons, the policy itself. A class's rules may well be edited before next year, and
 * that edit must not be able to restate what was decided this year.
 *
 * Re-running is safe and deliberate: an already-**approved** row is left alone, because
 * recompiling a class must not silently withdraw a principal's approval.
 */
export async function saveAnnualDecisions(
  input: unknown,
): Promise<ActionResult<{ saved: number; skippedApproved: number }>> {
  try {
    const actor = await requirePermission("compiler.review_results")
    const schoolId = await actorSchool(actor)
    const data = saveSchema.parse(input)

    const computed = await computeAnnualDecisions(data.classId, data.sessionId)
    if (!computed.success) return computed

    const resolved = await resolvedPolicyFor(schoolId, data.classId)
    const commentByStudent = new Map(
      data.comments.map((entry) => [entry.studentId, entry.principalComment]),
    )
    const existing = await prisma.annualResultDecision.findMany({
      where: { classId: data.classId, sessionId: data.sessionId },
      select: { studentId: true, approvedAt: true },
    })
    const approved = new Set(
      existing.filter((row) => row.approvedAt !== null).map((row) => row.studentId),
    )

    const now = new Date()
    let saved = 0

    for (const row of computed.data.rows) {
      if (approved.has(row.studentId)) continue

      const comment =
        commentByStudent.get(row.studentId) ??
        (row.principalComment || (data.useSuggestedComments ? row.suggestedComment : ""))

      const payload = {
        schoolId,
        classId: data.classId,
        sessionId: data.sessionId,
        decision: row.decision,
        principalComment: comment || null,
        sessionAverage: row.sessionAverage,
        subjectsOffered: row.subjectsOffered,
        subjectsPassed: row.subjectsPassed,
        creditsEarned: row.creditsEarned,
        termsCounted: row.termsCounted,
        policyBasis: resolved.policy as unknown as object,
        reasons: row.reasons,
        isOverride: row.isOverride,
        overrideReason: row.overrideReason,
        decidedBy: actor.userId,
        decidedAt: now,
      }

      await prisma.annualResultDecision.upsert({
        where: { studentId_sessionId: { studentId: row.studentId, sessionId: data.sessionId } },
        create: { studentId: row.studentId, ...payload },
        update: payload,
      })
      saved += 1
    }

    await recordAudit({
      actor,
      action: "annual_results.save",
      entityType: "AnnualResultDecision",
      entityId: data.classId,
      summary: `Recorded ${saved} annual decision(s) for ${computed.data.className}`,
    })

    revalidateResults()
    return { success: true, data: { saved, skippedApproved: approved.size } }
  } catch (error) {
    return toError(error, "Failed to save this session's decisions")
  }
}

const overrideSchema = z.object({
  studentId: z.string().min(1),
  sessionId: z.string().min(1),
  decision: z.enum(["PENDING", "PROMOTED", "REPEATED", "GRADUATED"]),
  principalComment: z.string().trim().max(600).optional().nullable(),
  overrideReason: z.string().trim().max(400).optional().nullable(),
})

/**
 * Changes one learner's decision by hand.
 *
 * Requires a reason whenever the chosen outcome is not the one the rules reached, and
 * refuses entirely when the class's policy forbids manual override. A school that has
 * turned overrides off has said something specific and this is where it has to hold.
 */
export async function setAnnualDecision(input: unknown): Promise<ActionResult<{ studentId: string }>> {
  try {
    const actor = await requirePermission("compiler.review_results")
    const schoolId = await actorSchool(actor)
    const data = overrideSchema.parse(input)

    const existing = await prisma.annualResultDecision.findUnique({
      where: { studentId_sessionId: { studentId: data.studentId, sessionId: data.sessionId } },
      select: {
        id: true,
        schoolId: true,
        classId: true,
        decision: true,
        approvedAt: true,
        reasons: true,
      },
    })
    if (!existing) throw new Error("Compile this session's decisions before editing one")
    assertSchoolAccess(actor, existing.schoolId)

    if (existing.approvedAt) {
      throw new Error("That decision has been approved. Withdraw the approval before changing it.")
    }

    const resolved = await resolvedPolicyFor(schoolId, existing.classId)

    // What the rules say, recomputed rather than trusted from the row, so a policy changed
    // since compiling is what the override is measured against.
    const recomputed = await computeAnnualDecisions(existing.classId, data.sessionId)
    const ruleDecision = recomputed.success
      ? recomputed.data.rows.find((row) => row.studentId === data.studentId)?.decision
      : undefined

    const contradicts = ruleDecision !== undefined && ruleDecision !== data.decision

    if (contradicts && !resolved.policy.allowManualOverride) {
      throw new Error(
        `This class does not allow manual overrides. The rules give ${decisionLabel(ruleDecision!)}.`,
      )
    }
    if (contradicts && !data.overrideReason) {
      throw new Error(
        `Give a reason for choosing ${decisionLabel(data.decision)} over ${decisionLabel(ruleDecision!)}.`,
      )
    }

    await prisma.annualResultDecision.update({
      where: { id: existing.id },
      data: {
        decision: data.decision,
        principalComment: data.principalComment ?? null,
        isOverride: contradicts,
        overrideReason: contradicts ? (data.overrideReason ?? null) : null,
        decidedBy: actor.userId,
        decidedAt: new Date(),
      },
    })

    await recordAudit({
      actor,
      action: "annual_results.override",
      entityType: "AnnualResultDecision",
      entityId: existing.id,
      summary: contradicts
        ? `Overrode ${decisionLabel(ruleDecision!)} to ${decisionLabel(data.decision)}: ${data.overrideReason}`
        : `Set decision to ${decisionLabel(data.decision)}`,
      before: { decision: existing.decision },
      after: { decision: data.decision },
    })

    revalidateResults()
    return { success: true, data: { studentId: data.studentId } }
  } catch (error) {
    return toError(error, "Failed to change that decision")
  }
}

/**
 * The principal's approval. Until this, nothing prints on a card.
 *
 * Guarded by `compiler.publish_results` rather than `review_results`: this is the same
 * class of act as releasing marks to families, and it should sit with the same person.
 */
export async function approveAnnualDecisions(
  classId: string,
  sessionId: string,
): Promise<ActionResult<{ approved: number }>> {
  try {
    const actor = await requirePermission("compiler.publish_results")
    const schoolId = await actorSchool(actor)

    const pending = await prisma.annualResultDecision.findMany({
      where: { classId, sessionId, schoolId, approvedAt: null },
      select: { id: true, decision: true },
    })
    if (pending.length === 0) {
      return { success: false, error: "There is nothing here to approve." }
    }

    const undecided = pending.filter((row) => row.decision === "PENDING")
    if (undecided.length > 0) {
      throw new Error(
        `${undecided.length} learner(s) still have no decision. Resolve them before approving.`,
      )
    }

    const now = new Date()
    const result = await prisma.annualResultDecision.updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: { approvedAt: now, approvedBy: actor.userId },
    })

    await recordAudit({
      actor,
      action: "annual_results.approve",
      entityType: "AnnualResultDecision",
      entityId: classId,
      summary: `Approved ${result.count} annual decision(s)`,
    })

    revalidateResults()
    return { success: true, data: { approved: result.count } }
  } catch (error) {
    return toError(error, "Failed to approve those decisions")
  }
}

export async function withdrawAnnualApproval(
  classId: string,
  sessionId: string,
  reason: string,
): Promise<ActionResult<{ withdrawn: number }>> {
  try {
    const actor = await requirePermission("compiler.publish_results")
    const schoolId = await actorSchool(actor)
    if (!reason || reason.trim().length < 3) {
      throw new Error("Give a reason for withdrawing the approval")
    }

    const result = await prisma.annualResultDecision.updateMany({
      where: { classId, sessionId, schoolId, approvedAt: { not: null } },
      data: { approvedAt: null, approvedBy: null },
    })

    await recordAudit({
      actor,
      action: "annual_results.withdraw_approval",
      entityType: "AnnualResultDecision",
      entityId: classId,
      summary: `Withdrew approval for ${result.count} decision(s): ${reason.trim()}`,
    })

    revalidateResults()
    return { success: true, data: { withdrawn: result.count } }
  } catch (error) {
    return toError(error, "Failed to withdraw that approval")
  }
}
