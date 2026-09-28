import { Prisma, type NotificationChannel } from "@prisma/client"

import { prisma } from "@/lib/db"
import { toE164 } from "@/lib/notifications/phone"
import { measureSms } from "@/lib/notifications/sms-segments"
import { resolveProviders } from "@/lib/notifications/providers"

/**
 * Queueing messages, and draining the queue.
 *
 * The outbox is the whole design. cPanel has no persistent worker, so a message cannot sit
 * in memory waiting to go; and sending inline from a request would mean a bursar's browser
 * held open through four hundred provider round trips, with no record of who was reached
 * when it failed at two hundred.
 *
 * Three properties matter, and each is enforced here rather than left to callers:
 *
 *  1. **Queueing twice sends once.** `dedupeKey` is unique per school, so republishing a
 *     class's results, or a cron run overlapping itself, collides at the database.
 *  2. **A worker takes work nobody else has.** Claiming is a conditional UPDATE, so two
 *     overlapping cron runs cannot both send the same row.
 *  3. **A bad address is not retried.** Retrying a number that is not a phone number turns
 *     one wasted message into three.
 */

export type QueueRequest = {
  schoolId: string
  channel: NotificationChannel
  /** A phone number in any shape, or an email address. Normalised here. */
  recipient: string
  recipientUserId?: string | null
  studentId?: string | null
  subject?: string | null
  body: string
  templateKey?: string | null
  /** Omit to allow the message to repeat — a manual one-off, say. */
  dedupeKey?: string | null
  triggeredBy?: string | null
}

export type QueueOutcome =
  | { queued: true; id: string }
  | { queued: false; reason: "DUPLICATE" | "BAD_RECIPIENT" | "EMPTY_BODY"; detail: string }

/** Deliberately loose: the job is to catch a missing @, not to adjudicate RFC 5322. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Puts one message in the queue.
 *
 * Never throws for an ordinary refusal. Callers are usually queueing in bulk — one family
 * with a mistyped number must not abort the other three hundred and ninety-nine.
 */
export async function queueMessage(request: QueueRequest): Promise<QueueOutcome> {
  const body = request.body.trim()
  if (body.length === 0) {
    return { queued: false, reason: "EMPTY_BODY", detail: "The message was empty" }
  }

  // Normalised at the door, so the worker never has to guess and the stored value is the
  // one the provider will accept.
  let recipient: string
  if (request.channel === "SMS") {
    const e164 = toE164(request.recipient)
    if (!e164) {
      return {
        queued: false,
        reason: "BAD_RECIPIENT",
        detail: `${request.recipient || "(blank)"} is not a usable mobile number`,
      }
    }
    recipient = e164
  } else {
    const trimmed = request.recipient.trim().toLowerCase()
    if (!EMAIL_SHAPE.test(trimmed)) {
      return {
        queued: false,
        reason: "BAD_RECIPIENT",
        detail: `${request.recipient || "(blank)"} is not a usable email address`,
      }
    }
    recipient = trimmed
  }

  try {
    const row = await prisma.notificationOutbox.create({
      data: {
        schoolId: request.schoolId,
        channel: request.channel,
        recipient,
        recipientUserId: request.recipientUserId ?? null,
        studentId: request.studentId ?? null,
        subject: request.channel === "EMAIL" ? (request.subject ?? null) : null,
        body,
        templateKey: request.templateKey ?? null,
        dedupeKey: request.dedupeKey ?? null,
        // Frozen now so a school can reconcile a provider's bill against what it asked for,
        // even after somebody edits the template.
        units: request.channel === "SMS" ? measureSms(body).segments : 1,
        triggeredBy: request.triggeredBy ?? null,
      },
      select: { id: true },
    })
    return { queued: true, id: row.id }
  } catch (error) {
    // P2002 on (schoolId, dedupeKey): this exact message is already queued or sent. That is
    // the guard working, not a failure — republishing results must not text everyone twice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        queued: false,
        reason: "DUPLICATE",
        detail: "This message has already been queued",
      }
    }
    throw error
  }
}

export type QueueSummary = { queued: number; duplicates: number; rejected: string[] }

/** Queues many, reporting what happened rather than stopping at the first problem. */
export async function queueMany(requests: QueueRequest[]): Promise<QueueSummary> {
  const summary: QueueSummary = { queued: 0, duplicates: 0, rejected: [] }

  for (const request of requests) {
    const outcome = await queueMessage(request)
    if (outcome.queued) summary.queued += 1
    else if (outcome.reason === "DUPLICATE") summary.duplicates += 1
    else summary.rejected.push(outcome.detail)
  }

  return summary
}

/**
 * How long to wait before trying a failed message again.
 *
 * Exponential, because a provider that just refused is usually still refusing a second
 * later, and a tight retry loop is how an account gets rate-limited for a problem that
 * would have cleared on its own.
 */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1))
}

/**
 * Sends whatever is due, up to `limit`.
 *
 * Claiming is a conditional `updateMany` on (id, status QUEUED): if two cron runs overlap,
 * exactly one of them wins each row and the other moves on. Without that, an overrunning
 * worker would double-send every message it was still holding.
 */
export async function drainOutbox(
  limit = 50,
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const providers = resolveProviders()
  const due = await prisma.notificationOutbox.findMany({
    where: { status: "QUEUED", availableAt: { lte: now } },
    orderBy: { availableAt: "asc" },
    take: limit,
    select: {
      id: true,
      channel: true,
      recipient: true,
      subject: true,
      body: true,
      attempts: true,
      maxAttempts: true,
    },
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const message of due) {
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: message.id, status: "QUEUED" },
      data: { status: "SENDING", attempts: { increment: 1 } },
    })
    if (claimed.count === 0) {
      // Another worker got there first.
      skipped += 1
      continue
    }

    const attempts = message.attempts + 1
    const outcome =
      message.channel === "SMS"
        ? await providers.sms.send(message.recipient, message.body)
        : await providers.email.send(
            message.recipient,
            message.subject ?? "",
            message.body,
          )

    if (outcome.ok) {
      await prisma.notificationOutbox.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          provider: message.channel === "SMS" ? providers.sms.name : providers.email.name,
          providerMessageId: outcome.providerMessageId,
          lastError: null,
        },
      })
      sent += 1
      continue
    }

    // Give up either when the provider says the message itself is wrong, or when we have
    // tried enough times. Retrying an unretryable refusal just spends money on the same
    // rejection.
    const giveUp = !outcome.retryable || attempts >= message.maxAttempts
    await prisma.notificationOutbox.update({
      where: { id: message.id },
      data: giveUp
        ? { status: "FAILED", failedAt: new Date(), lastError: outcome.error }
        : {
            status: "QUEUED",
            lastError: outcome.error,
            availableAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000),
          },
    })
    failed += 1
  }

  return { sent, failed, skipped }
}

/**
 * Releases rows stuck in SENDING.
 *
 * A worker killed mid-send — a cPanel process recycle, a deploy — leaves its claim behind,
 * and without this those messages are never sent and never reported. Ten minutes is far
 * longer than any real send and short enough that a family is not left uninformed.
 */
export async function requeueStalled(
  olderThanMinutes = 10,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000)
  const result = await prisma.notificationOutbox.updateMany({
    where: { status: "SENDING", updatedAt: { lt: cutoff } },
    data: { status: "QUEUED", lastError: "Worker stopped before the send completed" },
  })
  return result.count
}

/** SmartSMS email webhooks are at-most-once, so missed callbacks are reconciled through
 * the provider status endpoint. This checks state only and never resends a message. */
export async function reconcileEmailDeliveryStatuses(limit = 50, now: Date = new Date()): Promise<{ checked: number; delivered: number; failed: number }> {
  const provider = resolveProviders().email
  if (provider.name !== "smartsms-email" || !provider.getStatus) return { checked: 0, delivered: 0, failed: 0 }
  const rows = await prisma.notificationOutbox.findMany({
    where: { channel: "EMAIL", provider: "smartsms-email", status: "SENT", providerMessageId: { not: null }, updatedAt: { lt: new Date(now.getTime() - 60_000) } },
    orderBy: { sentAt: "asc" }, take: Math.max(1, Math.min(limit, 100)), select: { id: true, providerMessageId: true },
  })
  let delivered = 0; let failed = 0
  for (const row of rows) {
    const outcome = await provider.getStatus(row.providerMessageId!)
    if (!outcome.ok) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { lastError: `Delivery status check: ${outcome.error}` } })
      continue
    }
    if (outcome.status === "delivered") {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "DELIVERED", deliveredAt: now, lastError: null } }); delivered += 1
    } else if (["bounced", "complained", "failed"].includes(outcome.status)) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "FAILED", failedAt: now, lastError: `SmartSMS email status: ${outcome.status}` } }); failed += 1
    } else {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { updatedAt: now } })
    }
  }
  return { checked: rows.length, delivered, failed }
}

/** What is in the queue, for a screen that has to explain a bill. */
export async function outboxSummary(schoolId: string) {
  const grouped = await prisma.notificationOutbox.groupBy({
    by: ["channel", "status"],
    where: { schoolId },
    _count: { _all: true },
    _sum: { units: true },
  })

  return grouped.map((row) => ({
    channel: row.channel,
    status: row.status,
    messages: row._count._all,
    units: row._sum.units ?? 0,
  }))
}
