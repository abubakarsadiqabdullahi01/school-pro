import { drainOutbox, reconcileEmailDeliveryStatuses, requeueStalled } from "@/lib/notifications/outbox.server"
import { verifyBearerSecret } from "@/lib/payments/webhook-security"

export const runtime = "nodejs"
export const maxDuration = 60

/** Sends per run, bounded so one cron call never outlives the host's request limit. */
const BATCH = 50
const MAX_BATCHES = 4

/**
 * The notification worker, for the hosting scheduler.
 *
 * cPanel has no long-running process, so every few minutes the scheduler calls this with
 * the cron secret. It releases anything a killed run left mid-send, sends what is due in
 * bounded batches, and checks delivery for emails whose webhook never came. Overlapping
 * calls are safe: each message is claimed by exactly one run.
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $PAYMENT_CRON_SECRET" https://<host>/api/cron/notifications
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENT_CRON_SECRET ?? ""
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false }, { status: 401 })
  }
  try {
    const released = await requeueStalled()
    let sent = 0
    let failed = 0
    let skipped = 0
    let notConfigured: Array<"SMS" | "EMAIL"> = []
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await drainOutbox(BATCH)
      sent += result.sent
      failed += result.failed
      skipped += result.skipped
      notConfigured = result.notConfigured
      if (result.sent + result.failed + result.skipped === 0) break
    }
    const delivery = await reconcileEmailDeliveryStatuses(BATCH)
    return Response.json({ ok: notConfigured.length === 0, sent, failed, skipped, released, notConfigured, delivery })
  } catch (error) {
    console.error("Notification worker failed", error)
    return Response.json({ ok: false }, { status: 500 })
  }
}
