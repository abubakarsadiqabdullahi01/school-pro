import { prisma } from "@/lib/db"
import { drainOutbox, requeueStalled } from "@/lib/notifications/outbox.server"
import { resolveProviders } from "@/lib/notifications/providers"

/**
 * The worker that actually sends what has been queued.
 *
 * cPanel has no persistent process, so this is a cron job rather than a daemon:
 *
 *   *\/5 * * * * cd /home/USER/app && /usr/bin/node_modules/.bin/tsx \
 *       scripts/drain-notification-outbox.ts >> logs/notifications.log 2>&1
 *
 * Three things make it safe to run on a schedule that may overlap itself:
 *
 *  - Claiming a row is a conditional UPDATE, so two runs cannot send the same message.
 *  - A run that dies mid-send leaves rows in SENDING; the next run releases anything stuck
 *    there for more than ten minutes, so a process recycle costs a delay and not a family
 *    being left uninformed.
 *  - Batches are bounded, so a backlog of ten thousand does not turn into one enormous run
 *    that the host kills halfway.
 *
 * Exits non-zero only when it could not run at all. A message the provider refused is a
 * recorded failure on the row, not a broken cron job — alerting on that would train
 * whoever reads the log to ignore it.
 */

const BATCH = Number(process.env.NOTIFICATION_BATCH_SIZE ?? 50)
/** How many batches one run will take before leaving the rest for the next. */
const MAX_BATCHES = Number(process.env.NOTIFICATION_MAX_BATCHES ?? 5)

function stamp(): string {
  return new Date().toISOString()
}

async function main() {
  const providers = resolveProviders()
  if (providers.usingLogFallback) {
    // Said plainly and every run: a school that thinks it is texting parents and is only
    // writing to a log file has a problem worth shouting about.
    console.warn(
      `${stamp()} [notifications] NO PROVIDER CONFIGURED - messages are being written to this ` +
        `log and NOT delivered. Set TERMII_API_KEY/TERMII_SENDER_ID and RESEND_API_KEY/RESEND_FROM.`,
    )
  }

  const released = await requeueStalled()
  if (released > 0) {
    console.warn(`${stamp()} [notifications] released ${released} message(s) stuck mid-send`)
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const result = await drainOutbox(BATCH)
    sent += result.sent
    failed += result.failed
    skipped += result.skipped

    // Nothing was due; no point asking again in the same run.
    if (result.sent + result.failed + result.skipped === 0) break
  }

  const remaining = await prisma.notificationOutbox.count({ where: { status: "QUEUED" } })
  console.info(
    `${stamp()} [notifications] sent=${sent} failed=${failed} skipped=${skipped} still queued=${remaining}`,
  )

  await prisma.$disconnect()
}

void main().catch(async (error) => {
  console.error(`${stamp()} [notifications] run failed`, error)
  await prisma.$disconnect().catch(() => {})
  process.exitCode = 1
})
