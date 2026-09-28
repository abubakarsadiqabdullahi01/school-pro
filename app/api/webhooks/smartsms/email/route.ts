import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { smartSmsEmailEventSchema, verifySmartSmsEmailWebhook } from "@/lib/notifications/smartsms-webhook"

export async function POST(request: Request) {
  const secret = process.env.SMARTSMS_EMAIL_WEBHOOK_SECRET?.trim()
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 })
  const raw = Buffer.from(await request.arrayBuffer())
  if (raw.length === 0 || raw.length > 64_000) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  if (!verifySmartSmsEmailWebhook(raw, request.headers.get("x-smartsms-signature"), request.headers.get("x-smartsms-timestamp"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  let decoded: unknown
  try { decoded = JSON.parse(raw.toString("utf8")) } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const parsed = smartSmsEmailEventSchema.safeParse(decoded)
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  const event = parsed.data; const occurredAt = new Date(event.processed_at)
  if (event.event_type === "delivery") {
    await prisma.notificationOutbox.updateMany({
      where: { provider: "smartsms-email", providerMessageId: event.ems_id, recipient: event.to_email.toLowerCase(), status: { in: ["SENT", "DELIVERED"] } },
      data: { status: "DELIVERED", deliveredAt: occurredAt, lastError: null },
    })
  } else if (event.event_type === "bounce") {
    await prisma.notificationOutbox.updateMany({
      where: { provider: "smartsms-email", providerMessageId: event.ems_id, recipient: event.to_email.toLowerCase(), status: { in: ["SENT", "FAILED"] } },
      data: { status: "FAILED", failedAt: occurredAt, lastError: `Email ${event.bounce_type ?? "unknown"} bounce` },
    })
  }
  // Open/click/complaint/unsubscribe are valid delivery telemetry but do not rewrite the
  // accounting-style outbox state. SmartSMS owns suppression for complaints/unsubscribes.
  return new NextResponse(null, { status: 200 })
}
