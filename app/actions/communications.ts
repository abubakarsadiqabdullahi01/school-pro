"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { AuthorizationError, requireAnyPermission, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { providerScheduledFor } from "@/lib/notifications/delivery-notes"
import { formatNaira } from "@/lib/money"
import {
  applyGovernance,
  loadGovernance,
  queueGoverned,
  resolveTemplate,
  staffRecipients,
  type CampaignResult,
} from "@/lib/notifications/campaign.server"
import type { QueueRequest } from "@/lib/notifications/outbox.server"
import { resolveProviders } from "@/lib/notifications/providers"
import { recipientsForStudents, type Recipient } from "@/lib/notifications/recipients.server"
import { measureSms } from "@/lib/notifications/sms-segments"
import { TEMPLATE_VARIABLES, render, variablesFor, type TemplateKey } from "@/lib/notifications/templates"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * The school's outbound communication beyond term results: annual results notices, fee
 * reminders, announcements, the message history, and the school's own sending controls.
 *
 * Every send follows the same shape as the results notice: a preview that queues nothing
 * and shows the reach, the SMS cost and the exact wording; then a send that renders the
 * school's wording per recipient, applies the school's switches and SMS cap, and queues
 * with a dedupe key so a second click cannot message anyone twice.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }
type Channel = "SMS" | "EMAIL"

function toError(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof z.ZodError) return { success: false, error: error.issues[0]?.message ?? fallback }
  console.error(fallback, error)
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

async function schoolOf(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId
  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }
  throw new AuthorizationError("Select a school first")
}

function portalLink(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "")
  return base ? `${base}/auth/login` : ""
}

const channelsSchema = z.array(z.enum(["SMS", "EMAIL"])).min(1, "Choose SMS, email or both")

export type CampaignPreview = {
  audience: number
  smsRecipients: number
  emailRecipients: number
  smsSegmentsEach: number
  totalSmsSegments: number
  sampleMessage: string
  sampleEmailSubject: string | null
  /** Why a send would be refused, or null when it may go. */
  blockedReason: string | null
  /** SMS the monthly cap would stop, and the categories the school has switched off. */
  overSmsLimit: number
  switchedOff: number
  usingLogFallback: boolean
}

type Target = { recipient: Recipient; studentId: string | null; values: Record<string, string>; keySuffix: string }

/** Renders every target through the school's wording into queue requests. */
async function buildRequests(
  schoolId: string,
  key: TemplateKey,
  channels: Channel[],
  targets: Target[],
  dedupePrefix: string,
  actorId: string,
  availableAt?: Date | null,
): Promise<QueueRequest[]> {
  const templates = {
    SMS: await resolveTemplate(prisma, schoolId, key, "SMS"),
    EMAIL: await resolveTemplate(prisma, schoolId, key, "EMAIL"),
  }
  const allowed = variablesFor(key)
  const requests: QueueRequest[] = []
  for (const target of targets) {
    for (const channel of channels) {
      const address = channel === "SMS" ? target.recipient.phone : target.recipient.email
      const consent = channel === "SMS" ? target.recipient.allowSms : target.recipient.allowEmail
      if (!address || !consent) continue
      const body = render(templates[channel].body, target.values, allowed)
      if (!body.ok) continue
      const subject = channel === "EMAIL" && templates.EMAIL.subject ? render(templates.EMAIL.subject, target.values, allowed) : null
      requests.push({
        schoolId, channel, recipient: address, recipientUserId: target.recipient.userId, studentId: target.studentId,
        subject: subject?.ok ? subject.text : null, body: body.text, templateKey: key,
        dedupeKey: `${dedupePrefix}:${target.keySuffix}:${target.recipient.userId}:${channel}`,
        triggeredBy: actorId, availableAt: availableAt ?? null,
      })
    }
  }
  return requests
}

async function previewOf(schoolId: string, audience: number, requests: QueueRequest[], blockedReason: string | null): Promise<CampaignPreview> {
  const governed = applyGovernance(requests, await loadGovernance(prisma, schoolId))
  const sms = governed.allowed.filter((request) => request.channel === "SMS")
  const email = governed.allowed.find((request) => request.channel === "EMAIL")
  const sample = sms[0]?.body ?? email?.body ?? ""
  return {
    audience,
    smsRecipients: sms.length,
    emailRecipients: governed.allowed.filter((request) => request.channel === "EMAIL").length,
    smsSegmentsEach: sample ? measureSms(sms[0]?.body ?? sample).segments : 0,
    totalSmsSegments: governed.smsUnits,
    sampleMessage: sample,
    sampleEmailSubject: email?.subject ?? null,
    blockedReason: blockedReason ?? (governed.allowed.length === 0 ? "Nobody on this list can be reached on the chosen channels" : null),
    overSmsLimit: governed.overSmsLimit,
    switchedOff: governed.switchedOff,
    usingLogFallback: resolveProviders().usingLogFallback,
  }
}

async function currentTerm(schoolId: string) {
  return (await prisma.term.findFirst({ where: { session: { schoolId }, isCurrent: true }, select: { id: true, name: true, sessionId: true } }))
    ?? (await prisma.term.findFirst({ where: { session: { schoolId } }, orderBy: { startDate: "desc" }, select: { id: true, name: true, sessionId: true } }))
}

function refresh() {
  revalidatePath("/dashboard/admin/communications")
  revalidatePath("/dashboard/admin/communications/history")
}

// ---------------------------------------------------------------------------------------
// Annual results
// ---------------------------------------------------------------------------------------

const annualSchema = z.object({ classId: z.string().min(1), sessionId: z.string().min(1), channels: channelsSchema })

async function annualTargets(schoolId: string, classId: string, sessionId: string) {
  const [school, classTerms] = await Promise.all([
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
    prisma.classTerm.findMany({
      where: { classId, class: { schoolId }, term: { sessionId, session: { schoolId } } },
      orderBy: { term: { startDate: "asc" } },
      select: {
        class: { select: { name: true } }, term: { select: { name: true, session: { select: { name: true } } } },
        resultWorkflow: { select: { status: true } },
        students: { where: { status: "ACTIVE" }, select: { studentId: true } },
      },
    }),
  ])
  if (classTerms.length === 0) throw new Error("That class has no terms in this session")
  const unpublished = classTerms.filter((row) => !row.resultWorkflow || !["PUBLISHED", "LOCKED"].includes(row.resultWorkflow.status))
  const blockedReason = unpublished.length
    ? `Publish ${unpublished.map((row) => row.term.name).join(", ")} results for ${classTerms[0]!.class.name} before announcing the annual result`
    : null
  const last = classTerms[classTerms.length - 1]!
  const studentIds = last.students.map((row) => row.studentId)
  const groups = await recipientsForStudents(studentIds, schoolId)
  const decisions = await prisma.annualResultDecision.findMany({ where: { schoolId, sessionId, classId, studentId: { in: studentIds } }, select: { studentId: true, decision: true } })
  const decisionOf = new Map(decisions.map((row) => [row.studentId, row.decision.replaceAll("_", " ").toLowerCase()]))
  const targets: Target[] = groups.flatMap((group) => group.recipients.map((recipient) => ({
    recipient, studentId: group.studentId, keySuffix: group.studentId,
    values: {
      studentName: group.studentName, className: group.className ?? last.class.name, sessionName: last.term.session.name,
      decision: decisionOf.get(group.studentId) ?? "see the report card", schoolName: school.name, portalLink: portalLink(),
    },
  })))
  return { targets, audience: studentIds.length, blockedReason }
}

export async function previewAnnualNotice(input: unknown): Promise<ActionResult<CampaignPreview>> {
  try {
    const actor = await requirePermission("compiler.publish_results")
    const schoolId = await schoolOf(actor)
    const data = annualSchema.parse(input)
    const { targets, audience, blockedReason } = await annualTargets(schoolId, data.classId, data.sessionId)
    const requests = await buildRequests(schoolId, "results.annual", data.channels, targets, `results.annual:${data.classId}:${data.sessionId}`, actor.userId)
    return { success: true, data: await previewOf(schoolId, audience, requests, blockedReason) }
  } catch (error) {
    return toError(error, "Could not prepare the annual results notice")
  }
}

export async function sendAnnualNotice(input: unknown): Promise<ActionResult<CampaignResult>> {
  try {
    const actor = await requirePermission("compiler.publish_results")
    const schoolId = await schoolOf(actor)
    const data = annualSchema.parse(input)
    const { targets, blockedReason } = await annualTargets(schoolId, data.classId, data.sessionId)
    if (blockedReason) throw new Error(blockedReason)
    const requests = await buildRequests(schoolId, "results.annual", data.channels, targets, `results.annual:${data.classId}:${data.sessionId}`, actor.userId)
    const result = await queueGoverned(schoolId, requests)
    await recordAudit({ actor, action: "notifications.annual_notice", entityType: "NotificationOutbox", entityId: `${data.classId}:${data.sessionId}`,
      summary: `Queued ${result.queued} annual result notice(s)`, after: { ...result } })
    refresh()
    return { success: true, data: result }
  } catch (error) {
    return toError(error, "Could not send the annual results notice")
  }
}

// ---------------------------------------------------------------------------------------
// Fee reminders
// ---------------------------------------------------------------------------------------

const reminderSchema = z.object({
  classId: z.string().min(1).nullable().optional(),
  minBalance: z.coerce.number().min(0).max(100_000_000).default(1),
  channels: channelsSchema,
})

async function reminderTargets(schoolId: string, classId: string | null | undefined, minBalance: number) {
  const [school, term] = await Promise.all([
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
    currentTerm(schoolId),
  ])
  let inClass: string[] | null = null
  if (classId) {
    const rows = await prisma.studentClassTerm.findMany({
      where: { status: "ACTIVE", classTerm: { classId, class: { schoolId }, ...(term ? { termId: term.id } : {}) } },
      select: { studentId: true },
    })
    inClass = rows.map((row) => row.studentId)
  }
  const owing = await prisma.studentCharge.groupBy({
    by: ["studentId"],
    where: { schoolId, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] }, ...(inClass ? { studentId: { in: inClass } } : {}), student: { user: { isActive: true } } },
    _sum: { balance: true },
  })
  const debtors = owing.filter((row) => (row._sum.balance?.toNumber() ?? 0) >= minBalance)
  const termOwing = term ? await prisma.studentCharge.groupBy({
    by: ["studentId"],
    where: { schoolId, termId: term.id, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL"] }, studentId: { in: debtors.map((row) => row.studentId) } },
    _sum: { balance: true },
  }) : []
  const termOwingOf = new Map(termOwing.map((row) => [row.studentId, row._sum.balance?.toNumber() ?? 0]))
  const totalOf = new Map(debtors.map((row) => [row.studentId, row._sum.balance?.toNumber() ?? 0]))
  const groups = await recipientsForStudents(debtors.map((row) => row.studentId), schoolId)
  const targets: Target[] = groups.flatMap((group) => group.recipients.map((recipient) => ({
    recipient, studentId: group.studentId, keySuffix: group.studentId,
    values: {
      studentName: group.studentName, className: group.className ?? "—", termName: term?.name ?? "This term",
      amount: formatNaira(termOwingOf.get(group.studentId) ?? 0), balance: formatNaira(totalOf.get(group.studentId) ?? 0),
      schoolName: school.name, portalLink: portalLink(),
    },
  })))
  const totalOwing = [...totalOf.values()].reduce((sum, value) => sum + value, 0)
  return { targets, audience: debtors.length, totalOwing }
}

/** One reminder per family per day, however many times the button is pressed. */
function reminderPrefix(): string {
  return `fees.reminder:${new Date().toISOString().slice(0, 10)}`
}

export async function previewFeeReminder(input: unknown): Promise<ActionResult<CampaignPreview & { totalOwing: string }>> {
  try {
    const actor = await requireAnyPermission(["school.manage", "finance.setup"])
    const schoolId = await schoolOf(actor)
    const data = reminderSchema.parse(input)
    const { targets, audience, totalOwing } = await reminderTargets(schoolId, data.classId, data.minBalance)
    const requests = await buildRequests(schoolId, "fees.reminder", data.channels, targets, reminderPrefix(), actor.userId)
    return { success: true, data: { ...(await previewOf(schoolId, audience, requests, audience === 0 ? "No learner owes at least that amount" : null)), totalOwing: formatNaira(totalOwing) } }
  } catch (error) {
    return toError(error, "Could not prepare the fee reminder")
  }
}

export async function sendFeeReminder(input: unknown): Promise<ActionResult<CampaignResult>> {
  try {
    const actor = await requireAnyPermission(["school.manage", "finance.setup"])
    const schoolId = await schoolOf(actor)
    const data = reminderSchema.parse(input)
    const { targets, audience } = await reminderTargets(schoolId, data.classId, data.minBalance)
    if (audience === 0) throw new Error("No learner owes at least that amount")
    const requests = await buildRequests(schoolId, "fees.reminder", data.channels, targets, reminderPrefix(), actor.userId)
    const result = await queueGoverned(schoolId, requests)
    await recordAudit({ actor, action: "notifications.fee_reminder", entityType: "NotificationOutbox", entityId: data.classId ?? "all",
      summary: `Queued ${result.queued} fee reminder(s) to families of ${audience} learner(s)`, after: { ...result, minBalance: data.minBalance } })
    refresh()
    return { success: true, data: result }
  } catch (error) {
    return toError(error, "Could not send the fee reminder")
  }
}

// ---------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Give the announcement a short title").max(150),
  message: z.string().trim().min(5, "Write the message").max(2000),
  audience: z.enum(["ALL_PARENTS", "CLASS_PARENTS", "STAFF"]),
  classIds: z.array(z.string().min(1)).default([]),
  channels: channelsSchema,
  scheduledFor: z.coerce.date().nullable().optional(),
})

async function announcementTargets(schoolId: string, data: z.infer<typeof announcementSchema>) {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } })
  const base = { title: data.title, message: data.message, schoolName: school.name, portalLink: portalLink() }
  let recipients: Recipient[]
  if (data.audience === "STAFF") {
    recipients = await staffRecipients(schoolId)
  } else {
    if (data.audience === "CLASS_PARENTS" && data.classIds.length === 0) throw new Error("Choose at least one class")
    const term = await currentTerm(schoolId)
    const students = data.audience === "CLASS_PARENTS"
      ? (await prisma.studentClassTerm.findMany({
          where: { status: "ACTIVE", classTerm: { classId: { in: data.classIds }, class: { schoolId }, ...(term ? { termId: term.id } : {}) } },
          select: { studentId: true },
        })).map((row) => row.studentId)
      : (await prisma.student.findMany({ where: { schoolId, user: { isActive: true } }, select: { id: true } })).map((row) => row.id)
    const groups = await recipientsForStudents([...new Set(students)], schoolId)
    // A parent with three children is one person: one announcement, not three.
    const byUser = new Map<string, Recipient>()
    for (const group of groups) for (const recipient of group.recipients) byUser.set(recipient.userId, recipient)
    recipients = [...byUser.values()]
  }
  const targets: Target[] = recipients.map((recipient) => ({
    recipient, studentId: null, keySuffix: "person", values: { ...base, recipientName: recipient.name },
  }))
  return { targets, audience: recipients.length }
}

export async function previewAnnouncement(input: unknown): Promise<ActionResult<CampaignPreview>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const data = announcementSchema.parse(input)
    const { targets, audience } = await announcementTargets(schoolId, data)
    const requests = await buildRequests(schoolId, "announcement", data.channels, targets, "announcement:preview", actor.userId)
    return { success: true, data: await previewOf(schoolId, audience, requests, audience === 0 ? "Nobody is in this audience" : null) }
  } catch (error) {
    return toError(error, "Could not prepare the announcement")
  }
}

export async function sendAnnouncement(input: unknown): Promise<ActionResult<CampaignResult & { announcementId: string }>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const data = announcementSchema.parse(input)
    if (data.scheduledFor && data.scheduledFor.getTime() < Date.now() - 60_000) throw new Error("The scheduled time is in the past")
    const { targets, audience } = await announcementTargets(schoolId, data)
    if (audience === 0) throw new Error("Nobody is in this audience")
    const announcement = await prisma.announcement.create({
      data: { schoolId, title: data.title, message: data.message, audience: data.audience, classIds: data.classIds,
        channels: data.channels, status: "QUEUED", scheduledFor: data.scheduledFor ?? null, createdBy: actor.userId },
    })
    const requests = await buildRequests(schoolId, "announcement", data.channels, targets, `announcement:${announcement.id}`, actor.userId, data.scheduledFor)
    const result = await queueGoverned(schoolId, requests)
    await prisma.announcement.update({ where: { id: announcement.id }, data: { queuedCount: result.queued, sentAt: data.scheduledFor ?? new Date() } })
    await recordAudit({ actor, action: "notifications.announcement", entityType: "Announcement", entityId: announcement.id,
      summary: `Queued announcement "${data.title}" to ${result.queued} message(s)`, after: { audience: data.audience, ...result } })
    refresh()
    return { success: true, data: { ...result, announcementId: announcement.id } }
  } catch (error) {
    return toError(error, "Could not send the announcement")
  }
}

/** Withdraws a (usually scheduled) announcement: anything not yet sent is cancelled. */
export async function cancelAnnouncement(input: unknown): Promise<ActionResult<{ cancelled: number }>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const { id } = z.object({ id: z.string().uuid() }).parse(input)
    const announcement = await prisma.announcement.findFirst({ where: { id, schoolId }, select: { id: true, title: true } })
    if (!announcement) throw new Error("Announcement not found")
    const cancelled = await prisma.notificationOutbox.updateMany({
      where: { schoolId, status: "QUEUED", dedupeKey: { startsWith: `announcement:${id}:` } },
      data: { status: "CANCELLED", lastError: "Announcement withdrawn" },
    })
    await prisma.announcement.update({ where: { id }, data: { status: "CANCELLED" } })
    await recordAudit({ actor, action: "notifications.announcement_cancel", entityType: "Announcement", entityId: id,
      summary: `Withdrew announcement "${announcement.title}"; ${cancelled.count} unsent message(s) cancelled` })
    refresh()
    return { success: true, data: { cancelled: cancelled.count } }
  } catch (error) {
    return toError(error, "Could not withdraw the announcement")
  }
}

export async function listAnnouncements() {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const rows = await prisma.announcement.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 50 })
    const counts = await Promise.all(rows.map((row) => prisma.notificationOutbox.groupBy({
      by: ["status"], where: { schoolId, dedupeKey: { startsWith: `announcement:${row.id}:` } }, _count: { _all: true },
    })))
    return {
      success: true as const,
      data: rows.map((row, index) => ({
        id: row.id, title: row.title, message: row.message, audience: row.audience, status: row.status,
        channels: Array.isArray(row.channels) ? row.channels as string[] : [],
        scheduledFor: row.scheduledFor?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
        delivery: Object.fromEntries(counts[index]!.map((count) => [count.status, count._count._all])) as Record<string, number>,
      })),
    }
  } catch (error) {
    return toError(error, "Could not load announcements")
  }
}

// ---------------------------------------------------------------------------------------
// History and the school's controls
// ---------------------------------------------------------------------------------------

const historySchema = z.object({
  status: z.enum(["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "CANCELLED"]).optional(),
  channel: z.enum(["SMS", "EMAIL"]).optional(),
  templateKey: z.string().max(64).optional(),
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

const PAGE_SIZE = 50

export async function getNotificationHistory(input: unknown = {}) {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const filters = historySchema.parse(input)
    const where = {
      schoolId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.templateKey ? { templateKey: filters.templateKey } : {}),
      ...(filters.query ? { OR: [{ recipient: { contains: filters.query } }, { subject: { contains: filters.query } }, { body: { contains: filters.query } }] } : {}),
    }
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [rows, total, month, governance] = await Promise.all([
      prisma.notificationOutbox.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        select: { id: true, channel: true, recipient: true, subject: true, body: true, templateKey: true, status: true, attempts: true,
          maxAttempts: true, units: true, lastError: true, provider: true, providerMessageId: true,
          createdAt: true, sentAt: true, deliveredAt: true, failedAt: true, availableAt: true },
      }),
      prisma.notificationOutbox.count({ where }),
      prisma.notificationOutbox.groupBy({ by: ["channel", "status"], where: { schoolId, createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { units: true } }),
      loadGovernance(prisma, schoolId),
    ])
    const sum = (channel: Channel, statuses: string[]) => month.filter((row) => row.channel === channel && statuses.includes(row.status)).reduce((t, row) => t + row._count._all, 0)
    return {
      success: true as const,
      data: {
        rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null,
          deliveredAt: row.deliveredAt?.toISOString() ?? null, failedAt: row.failedAt?.toISOString() ?? null,
          availableAt: row.availableAt.toISOString() })),
        total, page: filters.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        month: {
          smsSent: sum("SMS", ["SENT", "DELIVERED"]), smsFailed: sum("SMS", ["FAILED"]),
          emailSent: sum("EMAIL", ["SENT", "DELIVERED"]), emailDelivered: sum("EMAIL", ["DELIVERED"]), emailFailed: sum("EMAIL", ["FAILED"]),
          waiting: month.filter((row) => row.status === "QUEUED" || row.status === "SENDING").reduce((t, row) => t + row._count._all, 0),
          smsUnits: governance.smsUnitsThisMonth, smsMonthlyLimit: governance.smsMonthlyLimit,
        },
        usingLogFallback: resolveProviders().usingLogFallback,
      },
    }
  } catch (error) {
    return toError(error, "Could not load the message history")
  }
}

/** Puts a failed message back in the queue for one more round of attempts. */
export async function retryNotification(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const { id } = z.object({ id: z.string().uuid() }).parse(input)
    const row = await prisma.notificationOutbox.findFirst({ where: { id, schoolId, status: "FAILED" }, select: { attempts: true, lastError: true } })
    if (!row) throw new Error("Only a failed message can be retried")
    // Recorded as failed by an earlier version, though SmartSMS had accepted it for later
    // delivery. Retrying would send, and charge for, the message twice.
    const scheduledFor = providerScheduledFor(row.lastError)
    if (scheduledFor) {
      throw new Error(`SmartSMS already accepted this message and will deliver it at ${scheduledFor}. Retrying would send it twice.`)
    }
    await prisma.notificationOutbox.update({
      where: { id },
      data: { status: "QUEUED", availableAt: new Date(), failedAt: null, maxAttempts: row.attempts + 3 },
    })
    await recordAudit({ actor, action: "notifications.retry", entityType: "NotificationOutbox", entityId: id, summary: "Retried a failed message" })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return toError(error, "Could not retry that message")
  }
}

export async function cancelNotification(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const { id } = z.object({ id: z.string().uuid() }).parse(input)
    const changed = await prisma.notificationOutbox.updateMany({ where: { id, schoolId, status: "QUEUED" }, data: { status: "CANCELLED", lastError: "Cancelled by the school" } })
    if (changed.count !== 1) throw new Error("Only a message still waiting to send can be cancelled")
    await recordAudit({ actor, action: "notifications.cancel", entityType: "NotificationOutbox", entityId: id, summary: "Cancelled a waiting message" })
    refresh()
    return { success: true, data: undefined }
  } catch (error) {
    return toError(error, "Could not cancel that message")
  }
}

const CATEGORY_LABELS: Record<TemplateKey, string> = {
  "results.published": "Term results released",
  "results.annual": "Annual results released",
  "fees.reminder": "Fee reminders",
  "payment.received": "Payment receipts",
  "payment.refunded": "Refund notices",
  announcement: "Announcements",
}

export async function getNotificationControls() {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const governance = await loadGovernance(prisma, schoolId)
    const { isEssential } = await import("@/lib/notifications/campaign.server")
    return {
      success: true as const,
      data: {
        smsMonthlyLimit: governance.smsMonthlyLimit,
        smsUnitsThisMonth: governance.smsUnitsThisMonth,
        categories: (Object.keys(TEMPLATE_VARIABLES) as TemplateKey[]).map((key) => ({
          key, label: CATEGORY_LABELS[key],
          channels: (["SMS", "EMAIL"] as const).map((channel) => ({
            channel, enabled: !governance.disabled.has(`${key}:${channel}`), essential: isEssential(key, channel),
          })),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Could not load the notification controls")
  }
}

const controlsSchema = z.object({
  disabled: z.array(z.string().regex(/^[a-z.]+:(SMS|EMAIL)$/)).max(40),
  smsMonthlyLimit: z.coerce.number().int().min(0).max(10_000_000).nullable(),
})

export async function saveNotificationControls(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await schoolOf(actor)
    const data = controlsSchema.parse(input)
    const { isEssential } = await import("@/lib/notifications/campaign.server")
    // Essential categories are never stored as off, whatever the form sent.
    const disabled = data.disabled.filter((entry) => {
      const [key, channel] = entry.split(":") as [TemplateKey, Channel]
      return key in TEMPLATE_VARIABLES && !isEssential(key, channel)
    })
    await prisma.schoolNotificationSettings.upsert({
      where: { schoolId },
      create: { schoolId, disabled, smsMonthlyLimit: data.smsMonthlyLimit },
      update: { disabled, smsMonthlyLimit: data.smsMonthlyLimit },
    })
    await recordAudit({ actor, action: "notifications.controls_save", entityType: "SchoolNotificationSettings", entityId: schoolId,
      summary: `Updated notification controls${data.smsMonthlyLimit !== null ? `; SMS cap ${data.smsMonthlyLimit}/month` : ""}`, after: { disabled, smsMonthlyLimit: data.smsMonthlyLimit } })
    refresh()
    revalidatePath("/dashboard/admin/school-settings/notifications")
    return { success: true, data: undefined }
  } catch (error) {
    return toError(error, "Could not save the notification controls")
  }
}

/** Classes and sessions for the campaign forms. */
export async function getCommunicationOptions() {
  try {
    const actor = await requireAnyPermission(["school.manage", "finance.setup", "compiler.publish_results"])
    const schoolId = await schoolOf(actor)
    const [classes, sessions] = await Promise.all([
      prisma.class.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.session.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    ])
    return { success: true as const, data: { classes, sessions } }
  } catch (error) {
    return toError(error, "Could not load classes and sessions")
  }
}
