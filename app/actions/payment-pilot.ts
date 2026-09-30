"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { requireRole } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { MAX_EVENT_ATTEMPTS, processGatewayEvent } from "@/lib/payments/gateway-event-processor.server"
import { SETTLED_BY_HAND_PREFIX } from "@/lib/payments/gateway-event-notes"
import { collectPaymentHealth } from "@/lib/payments/payment-health.server"

type Result<T> = { success: true; data: T } | { success: false; error: string }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const MONITOR_PATH = "/dashboard/super-admin/payments/monitor"

/** The Slice 8 pilot monitor: every school's payment health, for the platform owner only. */
export async function getPaymentPilotMonitor(): Promise<Result<Awaited<ReturnType<typeof collectPaymentHealth>> & { generatedAt: string }>> {
  try {
    await requireRole("SUPER_ADMIN")
    return { success: true, data: { ...(await collectPaymentHealth()), generatedAt: new Date().toISOString() } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load the payment monitor" }
  }
}

/**
 * Gives a parked (DEAD) event one more attempt, now: for when whatever stopped it has been
 * put right, such as Paystack being down for longer than the retries last. One attempt, not
 * a fresh set: if it fails again it is parked again at once with the new error, rather than
 * retrying out of reach for another day. Processing is idempotent, so a transfer already
 * recorded is not recorded twice.
 */
export async function retryParkedGatewayEvent(input: unknown): Promise<Result<{ result: string }>> {
  try {
    const actor = await requireRole("SUPER_ADMIN")
    const data = z.object({ eventId: z.string().uuid(), confirmation: z.literal(true) }).parse(input)
    const event = await prisma.gatewayEvent.findUnique({
      where: { id: data.eventId }, select: { id: true, schoolId: true, eventType: true, reference: true, lastError: true },
    })
    if (!event) throw new Error("Event not found")
    const reopened = await prisma.gatewayEvent.updateMany({
      where: { id: event.id, status: "DEAD" },
      data: { status: "PENDING", attempts: MAX_EVENT_ATTEMPTS - 1, nextAttemptAt: null, claimedAt: null },
    })
    if (reopened.count !== 1) throw new Error("Only a parked event can be retried; this one has moved on")
    const result = await processGatewayEvent(event.id)
    await recordAudit({ actor, schoolId: event.schoolId, action: "payment_gateway.event_retry", entityType: "GatewayEvent", entityId: event.id,
      summary: `Retried parked ${event.eventType} ${event.reference ?? ""}: ${result}`,
      before: { status: "DEAD", lastError: event.lastError }, after: { result } })
    revalidatePath(MONITOR_PATH)
    return { success: true, data: { result } }
  } catch (error) {
    return { success: false, error: message(error, "Could not retry the event") }
  }
}

/**
 * Closes a parked event that was dealt with outside DigiSchool (a transfer credited by hand,
 * say) so the monitor stops raising it. Nothing is posted: the note says what was done, the
 * audit log says who, and the event keeps its original error underneath.
 */
export async function settleParkedGatewayEvent(input: unknown): Promise<Result<undefined>> {
  try {
    const actor = await requireRole("SUPER_ADMIN")
    const data = z.object({ eventId: z.string().uuid(), note: z.string().trim().min(10).max(500), confirmation: z.literal(true) }).parse(input)
    const event = await prisma.gatewayEvent.findUnique({
      where: { id: data.eventId }, select: { id: true, schoolId: true, eventType: true, reference: true, lastError: true },
    })
    if (!event) throw new Error("Event not found")
    const settled = await prisma.gatewayEvent.updateMany({
      where: { id: event.id, status: "DEAD" },
      data: { status: "IGNORED", processedAt: new Date(), nextAttemptAt: null, claimedAt: null,
        lastError: `${SETTLED_BY_HAND_PREFIX}${actor.name}: ${data.note}\n\nParked with: ${event.lastError ?? "no error recorded"}`.slice(0, 10_000) },
    })
    if (settled.count !== 1) throw new Error("Only a parked event can be settled by hand; this one has moved on")
    await recordAudit({ actor, schoolId: event.schoolId, action: "payment_gateway.event_settle", entityType: "GatewayEvent", entityId: event.id,
      summary: `Settled parked ${event.eventType} ${event.reference ?? ""} by hand`,
      before: { status: "DEAD", lastError: event.lastError }, after: { status: "IGNORED", note: data.note } })
    revalidatePath(MONITOR_PATH)
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: message(error, "Could not settle the event") }
  }
}
