import type { Prisma, PrismaClient } from "@prisma/client"

import { prisma } from "@/lib/db"
import { queueMany, type QueueRequest, type QueueSummary } from "./outbox.server"
import { toE164 } from "./phone"
import type { Recipient } from "./recipients.server"
import { measureSms } from "./sms-segments"
import { DEFAULT_TEMPLATES, type TemplateKey } from "./templates"

/**
 * What every notification campaign shares: the school's wording, the school's own controls,
 * and the monthly SMS budget. Kept in one place so a results notice, a fee reminder, an
 * announcement and a payment receipt all obey the same rules — a switch a school turns off
 * is off everywhere, not only on the screen that happened to check it.
 */

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Messages a school cannot switch off. A family that paid must always get the emailed
 * receipt and be told of a refund; they are records, not marketing. SMS copies stay
 * optional because they cost the school money.
 */
const ESSENTIAL = new Set(["payment.received:EMAIL", "payment.refunded:EMAIL"])

export function isEssential(key: TemplateKey, channel: "SMS" | "EMAIL"): boolean {
  return ESSENTIAL.has(`${key}:${channel}`)
}

/** The school's own wording, or the built-in default when it has not set any. */
export async function resolveTemplate(
  db: Db,
  schoolId: string,
  key: TemplateKey,
  channel: "SMS" | "EMAIL",
): Promise<{ body: string; subject: string | null }> {
  const stored = await db.notificationTemplate.findUnique({
    where: { schoolId_templateKey_channel: { schoolId, templateKey: key, channel } },
    select: { body: true, subject: true, isActive: true },
  })
  if (stored?.isActive) return { body: stored.body, subject: stored.subject }
  const fallback = DEFAULT_TEMPLATES[key]
  return { body: channel === "SMS" ? fallback.sms : fallback.email, subject: channel === "SMS" ? null : fallback.emailSubject }
}

export type Governance = {
  disabled: Set<string>
  smsMonthlyLimit: number | null
  smsUnitsThisMonth: number
}

function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export async function loadGovernance(db: Db, schoolId: string, now: Date = new Date()): Promise<Governance> {
  const [settings, used] = await Promise.all([
    db.schoolNotificationSettings.findUnique({ where: { schoolId }, select: { disabled: true, smsMonthlyLimit: true } }),
    db.notificationOutbox.aggregate({
      where: { schoolId, channel: "SMS", createdAt: { gte: monthStart(now) }, status: { notIn: ["FAILED", "CANCELLED"] } },
      _sum: { units: true },
    }),
  ])
  const disabled = Array.isArray(settings?.disabled)
    ? settings!.disabled.filter((value): value is string => typeof value === "string")
    : []
  return { disabled: new Set(disabled), smsMonthlyLimit: settings?.smsMonthlyLimit ?? null, smsUnitsThisMonth: used._sum.units ?? 0 }
}

/** Whether the school allows this category on this channel at all. */
export function categoryAllowed(governance: Governance, key: TemplateKey, channel: "SMS" | "EMAIL"): boolean {
  return isEssential(key, channel) || !governance.disabled.has(`${key}:${channel}`)
}

export type GovernedRequests = {
  allowed: QueueRequest[]
  /** Requests dropped because the school switched the category off on that channel. */
  switchedOff: number
  /** SMS dropped because they would take the school past its monthly cap. */
  overSmsLimit: number
  smsUnits: number
}

/**
 * Applies a school's switches and SMS cap to a batch before it is queued. SMS is admitted
 * in order until the next message would cross the cap; nothing is partially sent.
 */
export function applyGovernance(requests: QueueRequest[], governance: Governance): GovernedRequests {
  const allowed: QueueRequest[] = []
  let switchedOff = 0
  let overSmsLimit = 0
  let smsUnits = 0
  let used = governance.smsUnitsThisMonth
  for (const request of requests) {
    const key = (request.templateKey ?? "") as TemplateKey
    if (request.templateKey && !categoryAllowed(governance, key, request.channel)) {
      switchedOff += 1
      continue
    }
    if (request.channel === "SMS") {
      const units = measureSms(request.body).segments
      if (governance.smsMonthlyLimit !== null && used + units > governance.smsMonthlyLimit) {
        overSmsLimit += 1
        continue
      }
      used += units
      smsUnits += units
    }
    allowed.push(request)
  }
  return { allowed, switchedOff, overSmsLimit, smsUnits }
}

export type CampaignResult = QueueSummary & { switchedOff: number; overSmsLimit: number }

/**
 * Governance, then queue. Every bulk send goes through here.
 *
 * When the school has an SMS cap and the batch carries SMS, counting and queueing happen in
 * one transaction that first locks the school's settings row. Counted in one step and
 * queued in another, two campaigns started together - a fee reminder and an announcement,
 * say - each saw the same headroom and together went past the cap the school set. The lock
 * makes the second wait until the first's messages are committed, so it counts them.
 *
 * Without a cap, or without SMS, there is nothing to race for, and the batch is queued
 * without holding anything.
 */
export async function queueGoverned(schoolId: string, requests: QueueRequest[]): Promise<CampaignResult> {
  const hasSms = requests.some((request) => request.channel === "SMS")
  const capped =
    hasSms &&
    (await prisma.schoolNotificationSettings.findUnique({
      where: { schoolId },
      select: { smsMonthlyLimit: true },
    }))?.smsMonthlyLimit != null

  if (!capped) {
    const governed = applyGovernance(requests, await loadGovernance(prisma, schoolId))
    const summary = await queueMany(governed.allowed)
    return { ...summary, switchedOff: governed.switchedOff, overSmsLimit: governed.overSmsLimit }
  }

  return prisma.$transaction(
    async (tx) => {
      // The lock is the first statement, so the count below is read after it is held and
      // sees every campaign that held it before this one.
      await tx.$queryRaw`SELECT id FROM SchoolNotificationSettings WHERE schoolId = ${schoolId} FOR UPDATE`
      const governed = applyGovernance(requests, await loadGovernance(tx, schoolId))
      const summary = await queueMany(governed.allowed, tx)
      return { ...summary, switchedOff: governed.switchedOff, overSmsLimit: governed.overSmsLimit }
    },
    // A whole school's parents, one insert each, inside one transaction.
    { maxWait: 30_000, timeout: 120_000 },
  )
}

/** Active staff with a login at this school — for staff announcements. */
export async function staffRecipients(schoolId: string): Promise<Recipient[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["ADMIN", "TEACHER", "ACCOUNTANT"] },
      OR: [{ admin: { schoolId } }, { teacher: { schoolId } }],
    },
    select: {
      id: true, firstName: true, lastName: true, phone: true, notifyBySms: true, notifyByEmail: true,
      credentials: { where: { type: "EMAIL" }, select: { value: true } },
    },
  })
  return users.map((user) => {
    const phone = toE164(user.phone)
    const email = user.credentials[0]?.value.toLowerCase() ?? null
    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      phone,
      email,
      allowSms: user.notifyBySms && phone !== null,
      allowEmail: user.notifyByEmail && email !== null,
      relationship: "PARENT" as const,
    }
  })
}
