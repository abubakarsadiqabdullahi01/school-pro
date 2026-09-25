"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { AuthorizationError, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { queueMany, outboxSummary, type QueueRequest } from "@/lib/notifications/outbox.server"
import { countReachable, recipientsForStudents } from "@/lib/notifications/recipients.server"
import { resolveProviders } from "@/lib/notifications/providers"
import { estimateSend } from "@/lib/notifications/sms-segments"
import {
  DEFAULT_TEMPLATES,
  isTemplateKey,
  render,
  validateTemplate,
  variablesFor,
  type TemplateKey,
} from "@/lib/notifications/templates"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * Telling families that results are out.
 *
 * Two rules from the plan for this module run through everything here, and both are about
 * restraint rather than delivery:
 *
 *  - **A result never travels in the message.** A text sits on a lock screen and passes
 *    through a provider; an email sits in an inbox for years. The notice says results are
 *    ready and links to the portal, where the reader has to sign in to see anything.
 *  - **Nothing is sent without showing the cost first.** `previewResultsNotice` counts the
 *    recipients and the segments so a bursar sees "reaches 312 people, 312 SMS" before
 *    they commit a school's money, not after.
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

/**
 * Sending costs money, so it sits with publishing rather than with reviewing.
 *
 * Whoever may release results to families is the same person who may tell them so.
 */
async function requireSender(): Promise<Actor> {
  return requirePermission("compiler.publish_results")
}

/** The school's own wording, or the built-in default when it has not set any. */
async function resolveTemplate(
  schoolId: string,
  key: TemplateKey,
  channel: "SMS" | "EMAIL",
): Promise<{ body: string; subject: string | null }> {
  const stored = await prisma.notificationTemplate.findUnique({
    where: { schoolId_templateKey_channel: { schoolId, templateKey: key, channel } },
    select: { body: true, subject: true, isActive: true },
  })

  if (stored?.isActive) {
    return { body: stored.body, subject: stored.subject }
  }

  const fallback = DEFAULT_TEMPLATES[key]
  return {
    body: channel === "SMS" ? fallback.sms : fallback.email,
    subject: channel === "SMS" ? null : fallback.emailSubject,
  }
}

/**
 * The link in the message.
 *
 * Deliberately the portal's front door rather than a direct link to a report card. A link
 * that opened a result without a sign-in would put a child's marks behind nothing but a
 * forwarded text.
 */
function portalBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? ""
}

function portalLink(): string {
  return `${portalBase()}/auth/login`
}

/**
 * Whether the link in a message would actually be usable.
 *
 * With `NEXT_PUBLIC_APP_URL` unset this renders as `/auth/login` — a relative path, which
 * is meaningless in a text message and unclickable in an email. Four hundred families
 * would be told to visit a path that goes nowhere, and the school would be billed for it.
 * Cheap to detect and worth refusing over.
 */
function portalLinkUsable(): boolean {
  return /^https?:\/\//.test(portalBase())
}

const noticeSchema = z.object({
  classTermId: z.string().min(1),
  channels: z.array(z.enum(["SMS", "EMAIL"])).min(1),
})

type NoticeContext = {
  schoolId: string
  schoolName: string
  className: string
  termName: string
  sessionName: string
  termId: string
  studentIds: string[]
}

async function loadContext(classTermId: string, schoolId: string): Promise<NoticeContext> {
  const classTerm = await prisma.classTerm.findUnique({
    where: { id: classTermId },
    select: {
      termId: true,
      class: { select: { name: true, schoolId: true } },
      term: { select: { name: true, session: { select: { name: true, schoolId: true } } } },
      students: { where: { status: "ACTIVE" }, select: { studentId: true } },
    },
  })

  if (!classTerm) throw new Error("That class term does not exist")
  if (classTerm.class.schoolId !== schoolId || classTerm.term.session.schoolId !== schoolId) {
    throw new AuthorizationError("That class belongs to another school")
  }

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { name: true },
  })

  return {
    schoolId,
    schoolName: school.name,
    className: classTerm.class.name,
    termName: classTerm.term.name,
    sessionName: classTerm.term.session.name,
    termId: classTerm.termId,
    studentIds: classTerm.students.map((row) => row.studentId),
  }
}

export type NoticePreview = {
  className: string
  termName: string
  learners: number
  smsRecipients: number
  emailRecipients: number
  smsSegmentsEach: number
  totalSmsSegments: number
  sampleMessage: string
  /** Learners nobody can be reached about, and why. */
  unreachable: Array<{ studentName: string; problem: string }>
  /** True when no real provider is configured, so nothing would actually be delivered. */
  usingLogFallback: boolean
  /**
   * True when the wording contains `{{portalLink}}` and there is no site address to build
   * one from, so the message would tell families to visit a relative path.
   */
  brokenPortalLink: boolean
}

/**
 * What a send would do, before it does it.
 *
 * Queues nothing. A bursar should be able to look at the count, the cost and the exact
 * wording — and at who cannot be reached at all — and then decide.
 */
export async function previewResultsNotice(
  input: unknown,
): Promise<ActionResult<NoticePreview>> {
  try {
    const actor = await requireSender()
    const schoolId = await actorSchool(actor)
    const data = noticeSchema.parse(input)

    const context = await loadContext(data.classTermId, schoolId)
    const groups = await recipientsForStudents(context.studentIds, schoolId)
    const template = await resolveTemplate(schoolId, "results.published", "SMS")

    const sample = render(
      template.body,
      {
        studentName: groups[0]?.studentName ?? "Your child",
        className: context.className,
        termName: context.termName,
        sessionName: context.sessionName,
        schoolName: context.schoolName,
        portalLink: portalLink(),
      },
      variablesFor("results.published"),
    )

    const sampleText = sample.ok ? sample.text : template.body
    const smsRecipients = countReachable(groups, "SMS")
    const estimate = estimateSend(sampleText, smsRecipients)

    return {
      success: true,
      data: {
        className: context.className,
        termName: context.termName,
        learners: context.studentIds.length,
        smsRecipients,
        emailRecipients: countReachable(groups, "EMAIL"),
        smsSegmentsEach: estimate.segmentsEach,
        totalSmsSegments: data.channels.includes("SMS") ? estimate.totalSegments : 0,
        sampleMessage: sampleText,
        unreachable: groups
          .filter((group) => group.problem !== null)
          .map((group) => ({ studentName: group.studentName, problem: group.problem! })),
        usingLogFallback: resolveProviders().usingLogFallback,
        brokenPortalLink: sampleText.includes("/auth/login") && !portalLinkUsable(),
      },
    }
  } catch (error) {
    return toError(error, "Could not work out who would be notified")
  }
}

/**
 * Queues the notice.
 *
 * Queues rather than sends: the worker drains the outbox. Every message carries a dedupe
 * key built from the class term, the learner, the recipient and the channel, so pressing
 * send twice — or republishing the results — reaches each family once.
 */
export async function sendResultsNotice(
  input: unknown,
): Promise<ActionResult<{ queued: number; duplicates: number; rejected: string[] }>> {
  try {
    const actor = await requireSender()
    const schoolId = await actorSchool(actor)
    const data = noticeSchema.parse(input)

    const context = await loadContext(data.classTermId, schoolId)
    const groups = await recipientsForStudents(context.studentIds, schoolId)

    const templates = {
      SMS: await resolveTemplate(schoolId, "results.published", "SMS"),
      EMAIL: await resolveTemplate(schoolId, "results.published", "EMAIL"),
    }

    // Refuse rather than send a link that goes nowhere. A school paying for four hundred
    // texts that read "Sign in to view: /auth/login" has been failed twice over — by the
    // message and by the bill — and the check costs nothing.
    const usesLink = data.channels.some((channel) =>
      templates[channel].body.includes("{{portalLink}}"),
    )
    if (usesLink && !portalLinkUsable()) {
      throw new Error(
        "The site address is not configured, so the link in the message would not work. " +
          "Set NEXT_PUBLIC_APP_URL, or remove {{portalLink}} from the wording.",
      )
    }

    const requests: QueueRequest[] = []

    for (const group of groups) {
      const values = {
        studentName: group.studentName,
        className: group.className ?? context.className,
        termName: context.termName,
        sessionName: context.sessionName,
        schoolName: context.schoolName,
        portalLink: portalLink(),
      }

      for (const channel of data.channels) {
        const template = templates[channel]
        const body = render(template.body, values, variablesFor("results.published"))
        if (!body.ok) continue

        const subject =
          channel === "EMAIL" && template.subject
            ? render(template.subject, values, variablesFor("results.published"))
            : null

        for (const recipient of group.recipients) {
          const allowed = channel === "SMS" ? recipient.allowSms : recipient.allowEmail
          if (!allowed) continue

          const address = channel === "SMS" ? recipient.phone : recipient.email
          if (!address) continue

          requests.push({
            schoolId,
            channel,
            recipient: address,
            recipientUserId: recipient.userId,
            studentId: group.studentId,
            subject: subject?.ok ? subject.text : null,
            body: body.text,
            templateKey: "results.published",
            // The identity of this message: this class term, this learner, this person,
            // this channel. Pressing send again collides here rather than sending twice.
            dedupeKey: `results.published:${data.classTermId}:${group.studentId}:${recipient.userId}:${channel}`,
            triggeredBy: actor.userId,
          })
        }
      }
    }

    const summary = await queueMany(requests)

    await recordAudit({
      actor,
      action: "notifications.results_notice",
      entityType: "NotificationOutbox",
      entityId: data.classTermId,
      summary:
        `Queued ${summary.queued} result notice(s) for ${context.className} ${context.termName}` +
        (summary.duplicates > 0 ? `, ${summary.duplicates} already sent` : ""),
    })

    revalidatePath("/dashboard/admin/compiler/notifications")
    return { success: true, data: summary }
  } catch (error) {
    return toError(error, "Could not queue those notices")
  }
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  templateKey: z.string().refine(isTemplateKey, "That is not a message this system sends"),
  channel: z.enum(["SMS", "EMAIL"]),
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().min(1).max(4000),
  isActive: z.coerce.boolean().default(true),
})

export async function saveNotificationTemplate(
  input: unknown,
): Promise<ActionResult<{ templateKey: string }>> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await actorSchool(actor)
    const data = templateSchema.parse(input)
    const key = data.templateKey as TemplateKey

    const verdict = validateTemplate(data.body, key, data.channel)
    if (!verdict.ok) throw new Error(verdict.errors.join(" "))

    const row = {
      subject: data.channel === "EMAIL" ? (data.subject ?? null) : null,
      body: data.body,
      isActive: data.isActive,
    }

    await prisma.notificationTemplate.upsert({
      where: { schoolId_templateKey_channel: { schoolId, templateKey: key, channel: data.channel } },
      create: { schoolId, templateKey: key, channel: data.channel, ...row },
      update: row,
    })

    await recordAudit({
      actor,
      action: "notifications.template_save",
      entityType: "NotificationTemplate",
      entityId: key,
      summary: `Updated the ${data.channel.toLowerCase()} wording for ${key}`,
    })

    revalidatePath("/dashboard/admin/school-settings/notifications")
    return { success: true, data: { templateKey: key } }
  } catch (error) {
    return toError(error, "Could not save that wording")
  }
}

export async function getNotificationSettings(): Promise<
  ActionResult<{
    templates: Array<{
      templateKey: string
      channel: string
      subject: string | null
      body: string
      isActive: boolean
      isDefault: boolean
      variables: readonly string[]
    }>
    queue: Awaited<ReturnType<typeof outboxSummary>>
    usingLogFallback: boolean
  }>
> {
  try {
    const actor = await requirePermission("school.manage")
    const schoolId = await actorSchool(actor)

    const stored = await prisma.notificationTemplate.findMany({ where: { schoolId } })
    const byKey = new Map(stored.map((row) => [`${row.templateKey}:${row.channel}`, row]))

    const templates = (Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]).flatMap((key) =>
      (["SMS", "EMAIL"] as const).map((channel) => {
        const row = byKey.get(`${key}:${channel}`)
        const fallback = DEFAULT_TEMPLATES[key]
        return {
          templateKey: key,
          channel,
          subject: row ? row.subject : channel === "EMAIL" ? fallback.emailSubject : null,
          body: row ? row.body : channel === "SMS" ? fallback.sms : fallback.email,
          isActive: row?.isActive ?? true,
          isDefault: !row,
          variables: variablesFor(key),
        }
      }),
    )

    return {
      success: true,
      data: {
        templates,
        queue: await outboxSummary(schoolId),
        usingLogFallback: resolveProviders().usingLogFallback,
      },
    }
  } catch (error) {
    return toError(error, "Could not load the notification settings")
  }
}
