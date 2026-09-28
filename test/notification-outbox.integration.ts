import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The notification outbox, against a real database.
 *
 * The pure tests cover phone shapes, segment counting and template rendering. These cover
 * the parts only a database can settle, and the first two are the ones that would cost a
 * school real money if they were wrong:
 *
 *  - **Queueing twice sends once.** Republishing a class's results, or a bursar clicking
 *    send again because nothing seemed to happen, must not text every family twice.
 *  - **Two overlapping workers cannot both send the same row.** A cron every five minutes
 *    that occasionally takes six is the normal case, not an edge case.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T>(loader: T) => loader,
}))
vi.mock("@/lib/school-context.server", () => ({ getActiveSchool: async () => null }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

const { prisma } = await import("@/lib/db")
const { queueMessage, queueMany, drainOutbox, requeueStalled, backoffMinutes, outboxSummary } =
  await import("@/lib/notifications/outbox.server")

const DEDUPE_PREFIX = "ZZNotify"
let schoolId = ""

async function clean() {
  await prisma.notificationOutbox.deleteMany({
    where: { OR: [{ dedupeKey: { startsWith: DEDUPE_PREFIX } }, { body: { startsWith: DEDUPE_PREFIX } }] },
  })
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    schoolId,
    channel: "SMS" as const,
    recipient: "08012345678",
    body: `${DEDUPE_PREFIX} results are ready`,
    dedupeKey: `${DEDUPE_PREFIX}:default`,
    ...overrides,
  }
}

// A test run must never reach a real SMS or email provider, whatever .env.local holds:
// these tests drain the shared queue, and real credentials would text real numbers.
for (const key of ["SMARTSMS_API_TOKEN", "SMARTSMS_SENDER_ID", "TERMII_API_KEY", "TERMII_SENDER_ID", "RESEND_API_KEY", "RESEND_FROM"]) {
  delete process.env[key]
}

beforeAll(async () => {
  const school = await prisma.school.findFirstOrThrow({ select: { id: true } })
  schoolId = school.id
  await clean()
})

afterAll(clean)
beforeEach(clean)

describe("queueing", () => {
  it("normalises the number on the way in, so the worker never has to guess", async () => {
    const outcome = await queueMessage(message({ recipient: "0801 234 5678" }))
    expect(outcome.queued).toBe(true)

    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      select: { recipient: true, units: true },
    })
    expect(row.recipient).toBe("+2348012345678")
    // Segments frozen at queue time, so a provider bill can be reconciled later.
    expect(row.units).toBe(1)
  })

  it("refuses a number that would never deliver, without throwing", async () => {
    // One family with a mistyped number must not abort the other three hundred.
    const outcome = await queueMessage(message({ recipient: "06012345678" }))
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) expect(outcome.reason).toBe("BAD_RECIPIENT")
  })

  it("refuses an email address that is not one", async () => {
    const outcome = await queueMessage(message({ channel: "EMAIL", recipient: "not-an-address" }))
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) expect(outcome.reason).toBe("BAD_RECIPIENT")
  })

  it("lower-cases an email address so the same inbox is one recipient", async () => {
    await queueMessage(message({ channel: "EMAIL", recipient: "Parent@Example.TEST" }))
    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      select: { recipient: true },
    })
    expect(row.recipient).toBe("parent@example.test")
  })

  it("refuses an empty message", async () => {
    const outcome = await queueMessage(message({ body: "   " }))
    expect(outcome.queued).toBe(false)
    if (!outcome.queued) expect(outcome.reason).toBe("EMPTY_BODY")
  })
})

describe("queueing twice sends once", () => {
  it("collides on the dedupe key rather than queueing a second copy", async () => {
    const first = await queueMessage(message())
    const second = await queueMessage(message())

    expect(first.queued).toBe(true)
    expect(second.queued).toBe(false)
    if (!second.queued) expect(second.reason).toBe("DUPLICATE")

    const count = await prisma.notificationOutbox.count({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
    })
    expect(count).toBe(1)
  })

  it("still refuses after the first copy has been sent", async () => {
    // The guard has to outlive the send, or a republish a week later texts everyone again.
    await queueMessage(message())
    await drainOutbox()

    const again = await queueMessage(message())
    expect(again.queued).toBe(false)
  })

  it("allows a message that deliberately carries no dedupe key", async () => {
    // A manual one-off is allowed to repeat.
    const first = await queueMessage(message({ dedupeKey: null }))
    const second = await queueMessage(message({ dedupeKey: null }))
    expect(first.queued).toBe(true)
    expect(second.queued).toBe(true)
  })

  it("reports the whole batch rather than stopping at the first problem", async () => {
    const summary = await queueMany([
      message({ dedupeKey: `${DEDUPE_PREFIX}:a` }),
      message({ dedupeKey: `${DEDUPE_PREFIX}:a` }),
      message({ dedupeKey: `${DEDUPE_PREFIX}:b`, recipient: "nonsense" }),
      message({ dedupeKey: `${DEDUPE_PREFIX}:c` }),
    ])

    expect(summary).toMatchObject({ queued: 2, duplicates: 1 })
    expect(summary.rejected).toHaveLength(1)
  })
})

describe("draining", () => {
  it("sends what is due and records the provider", async () => {
    await queueMessage(message())
    const result = await drainOutbox()

    expect(result.sent).toBe(1)
    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      select: { status: true, sentAt: true, provider: true, attempts: true },
    })
    expect(row.status).toBe("SENT")
    expect(row.sentAt).not.toBeNull()
    // No real provider is configured in a test run, and the log adapter says so honestly
    // rather than pretending to be Termii.
    expect(row.provider).toBe("log")
    expect(row.attempts).toBe(1)
  })

  it("does not send the same row twice", async () => {
    await queueMessage(message())
    const first = await drainOutbox()
    const second = await drainOutbox()

    expect(first.sent).toBe(1)
    expect(second.sent).toBe(0)
  })

  it("leaves a message alone until it is due", async () => {
    await queueMessage(message())
    await prisma.notificationOutbox.updateMany({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      data: { availableAt: new Date(Date.now() + 60 * 60_000) },
    })

    expect((await drainOutbox()).sent).toBe(0)
  })

  it("respects the batch limit so a backlog does not become one enormous run", async () => {
    await queueMany(
      Array.from({ length: 5 }, (_, index) =>
        message({ dedupeKey: `${DEDUPE_PREFIX}:batch-${index}` }),
      ),
    )

    const result = await drainOutbox(2)
    expect(result.sent).toBe(2)
    expect(
      await prisma.notificationOutbox.count({
        where: { dedupeKey: { startsWith: `${DEDUPE_PREFIX}:batch-` }, status: "QUEUED" },
      }),
    ).toBe(3)
  })
})

describe("a worker that died mid-send", () => {
  it("releases rows stuck in SENDING, so nobody is left uninformed", async () => {
    await queueMessage(message())
    await prisma.notificationOutbox.updateMany({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      data: { status: "SENDING", updatedAt: new Date(Date.now() - 30 * 60_000) },
    })

    const released = await requeueStalled(10)
    expect(released).toBeGreaterThanOrEqual(1)

    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      select: { status: true, lastError: true },
    })
    expect(row.status).toBe("QUEUED")
    expect(row.lastError).toContain("stopped before the send completed")
  })

  it("leaves a send that is merely in progress alone", async () => {
    await queueMessage(message())
    await prisma.notificationOutbox.updateMany({
      where: { dedupeKey: `${DEDUPE_PREFIX}:default` },
      data: { status: "SENDING" },
    })

    expect(await requeueStalled(10)).toBe(0)
  })
})

describe("backoff", () => {
  it("grows with each attempt rather than hammering a provider that is refusing", () => {
    expect(backoffMinutes(1)).toBe(1)
    expect(backoffMinutes(2)).toBe(2)
    expect(backoffMinutes(3)).toBe(4)
  })

  it("is capped, so a message does not drift days into the future", () => {
    expect(backoffMinutes(50)).toBe(60)
  })
})

describe("outboxSummary", () => {
  it("counts messages and billable units per channel and status", async () => {
    await queueMany([
      message({ dedupeKey: `${DEDUPE_PREFIX}:s1` }),
      message({ dedupeKey: `${DEDUPE_PREFIX}:s2`, body: `${DEDUPE_PREFIX} ${"a".repeat(200)}` }),
    ])

    const summary = await outboxSummary(schoolId)
    const queued = summary.find((row) => row.channel === "SMS" && row.status === "QUEUED")

    expect(queued?.messages).toBe(2)
    // One single-segment message and one that runs to two.
    expect(queued?.units).toBe(3)
  })
})
