import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Idle session expiry, against a real database.
 *
 * `lib/session-policy.test.ts` proves the arithmetic. This proves the parts only a
 * database can answer, and one of them is the whole feature:
 *
 *   **Asking how long a session has left must not extend how long it has left.**
 *
 * A countdown built on the wrong helper would refresh the clock every few seconds and
 * nobody would ever be signed out — an idle timeout that looks right in every screenshot
 * and protects nothing. That is the case `peek does not count as activity` pins down.
 */

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  // The real one needs a request context. Identity is right here: these tests are about
  // what is written to LoginSession, not about caching.
  unstable_cache: <T>(loader: T) => loader,
}))

const { prisma } = await import("@/lib/db")
const { touchSession, peekSession, keepSessionAlive, getSessionSecurity } = await import(
  "@/lib/session-activity.server"
)

const MINUTE = 60_000
const DAY = 86_400_000

let userId = ""
let schoolId = ""
const createdSessionIds: string[] = []

/** A sign-in with the clock wherever we need it. */
async function makeSession(options: {
  lastActivity: Date | null
  issuedAt?: Date
  expiresAt?: Date
  revokedAt?: Date | null
}) {
  const now = Date.now()
  const row = await prisma.loginSession.create({
    data: {
      userId,
      ipAddress: "127.0.0.1",
      userAgent: "integration-test",
      sessionToken: `idle-test-${now}-${Math.random().toString(36).slice(2)}`,
      issuedAt: options.issuedAt ?? new Date(now - 10 * MINUTE),
      expiresAt: options.expiresAt ?? new Date(now + 30 * DAY),
      lastActivity: options.lastActivity,
      revokedAt: options.revokedAt ?? null,
    },
    select: { id: true },
  })
  createdSessionIds.push(row.id)
  return row.id
}

async function read(id: string) {
  return prisma.loginSession.findUniqueOrThrow({
    where: { id },
    select: { lastActivity: true, revokedAt: true },
  })
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school to sign in as")
  userId = admin.id
  schoolId = admin.admin.schoolId
})

afterAll(async () => {
  await prisma.loginSession.deleteMany({ where: { id: { in: createdSessionIds } } })
  await prisma.systemConfiguration.deleteMany({
    where: { schoolId, configKey: { startsWith: "idleTimeout" } },
  })
})

beforeEach(async () => {
  // Each test sets its own limits; none should inherit the last one's.
  await prisma.systemConfiguration.deleteMany({
    where: {
      schoolId,
      configKey: { in: ["idleTimeoutPrivilegedMinutes", "sessionWarningSeconds"] },
    },
  })
})

/** Writes a school-level limit the way the settings screen does. */
async function setIdleLimit(minutes: number) {
  await prisma.systemConfiguration.create({
    data: {
      schoolId,
      configKey: "idleTimeoutPrivilegedMinutes",
      configValue: String(minutes),
      configType: "NUMBER",
    },
  })
}

describe("the clock is written", () => {
  it("stamps a session it has never seen, rather than expiring it", async () => {
    // Every session signed in before this feature shipped has lastActivity = null.
    const id = await makeSession({ lastActivity: null, issuedAt: new Date(Date.now() - 20 * DAY) })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(true)
    const row = await read(id)
    expect(row.lastActivity).not.toBeNull()
    expect(row.revokedAt).toBeNull()
  })

  it("does not write again within the throttle window", async () => {
    // Otherwise every server action on every page adds an UPDATE to the hot path.
    const stamped = new Date(Date.now() - 5_000)
    const id = await makeSession({ lastActivity: stamped })

    await touchSession(id, "ADMIN", schoolId)

    const row = await read(id)
    expect(row.lastActivity?.getTime()).toBe(stamped.getTime())
  })

  it("writes again once the throttle has elapsed", async () => {
    const stale = new Date(Date.now() - 5 * MINUTE)
    const id = await makeSession({ lastActivity: stale })

    await touchSession(id, "ADMIN", schoolId)

    const row = await read(id)
    expect(row.lastActivity!.getTime()).toBeGreaterThan(stale.getTime())
  })
})

describe("expiry", () => {
  it("signs out a session left unused past the limit, and revokes it", async () => {
    await setIdleLimit(30)
    const id = await makeSession({ lastActivity: new Date(Date.now() - 45 * MINUTE) })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.state).toBe("IDLE_EXPIRED")
      expect(result.reason).toContain("left unused")
    }

    // Revoked, not merely refused. Without this the token works again the moment anything
    // else touches the clock, and "signed out for inactivity" would not mean signed out.
    const row = await read(id)
    expect(row.revokedAt).not.toBeNull()
  })

  it("leaves a session used a moment ago alone", async () => {
    await setIdleLimit(30)
    const id = await makeSession({ lastActivity: new Date(Date.now() - 2 * MINUTE) })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(true)
    expect((await read(id)).revokedAt).toBeNull()
  })

  it("honours a limit of zero as no idle limit at all", async () => {
    await setIdleLimit(0)
    const id = await makeSession({ lastActivity: new Date(Date.now() - 10 * DAY) })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(true)
    expect((await read(id)).revokedAt).toBeNull()
  })

  it("expires a session past its absolute ceiling however recently it was used", async () => {
    const id = await makeSession({
      lastActivity: new Date(Date.now() - 1 * MINUTE),
      issuedAt: new Date(Date.now() - 40 * DAY),
      expiresAt: new Date(Date.now() - 1 * DAY),
    })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })

  it("rejects an already-revoked session without claiming it timed out", async () => {
    const id = await makeSession({ lastActivity: new Date(), revokedAt: new Date() })

    const result = await touchSession(id, "ADMIN", schoolId)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.state).toBe("REVOKED")
  })

  it("does not sign anybody out when the session row has gone", async () => {
    // Deleting login history must not log people out.
    const result = await touchSession("00000000-0000-0000-0000-000000000000", "ADMIN", schoolId)
    expect(result.ok).toBe(true)
  })
})

describe("peek does not count as activity", () => {
  it("leaves lastActivity exactly as it found it", async () => {
    // THE case this whole feature turns on. If reading the countdown refreshed the clock,
    // an open tab would never expire and the timeout would be decoration.
    await setIdleLimit(30)
    const stamped = new Date(Date.now() - 20 * MINUTE)
    const id = await makeSession({ lastActivity: stamped })

    const first = await peekSession(id, "ADMIN", schoolId)
    const second = await peekSession(id, "ADMIN", schoolId)

    expect(first?.freshness.state).toBe("ACTIVE")
    expect((await read(id)).lastActivity?.getTime()).toBe(stamped.getTime())

    // And the countdown keeps falling rather than resetting between polls.
    expect(second!.freshness.secondsRemaining).toBeLessThanOrEqual(
      first!.freshness.secondsRemaining,
    )
  })

  it("reports a countdown a warning dialog can use", async () => {
    await setIdleLimit(30)
    const id = await makeSession({ lastActivity: new Date(Date.now() - 29 * MINUTE) })

    const check = await peekSession(id, "ADMIN", schoolId)

    expect(check).not.toBeNull()
    expect(check!.idleMinutes).toBe(30)
    expect(check!.freshness.secondsRemaining).toBeLessThanOrEqual(60)
    expect(check!.freshness.secondsRemaining).toBeGreaterThan(0)
  })

  it("returns nothing for a revoked session", async () => {
    const id = await makeSession({ lastActivity: new Date(), revokedAt: new Date() })
    expect(await peekSession(id, "ADMIN", schoolId)).toBeNull()
  })
})

describe("staying signed in", () => {
  it("extends a live session", async () => {
    const stale = new Date(Date.now() - 20 * MINUTE)
    const id = await makeSession({ lastActivity: stale })

    expect(await keepSessionAlive(id)).toBe(true)
    expect((await read(id)).lastActivity!.getTime()).toBeGreaterThan(stale.getTime())
  })

  it("refuses a session that is already over", async () => {
    // Once the clock has run out a button cannot bring it back, and pretending otherwise
    // leaves somebody clicking a control that silently does nothing.
    const id = await makeSession({
      lastActivity: new Date(Date.now() - MINUTE),
      expiresAt: new Date(Date.now() - MINUTE),
    })

    expect(await keepSessionAlive(id)).toBe(false)
  })

  it("refuses a revoked session", async () => {
    const id = await makeSession({ lastActivity: new Date(), revokedAt: new Date() })
    expect(await keepSessionAlive(id)).toBe(false)
  })
})

describe("settings", () => {
  it("reads the school's own limit in preference to the default", async () => {
    await setIdleLimit(17)
    const settings = await getSessionSecurity(schoolId)
    expect(settings.idleMinutesPrivileged).toBe(17)
  })

  it("falls back to the documented defaults when a school has set nothing", async () => {
    const settings = await getSessionSecurity(schoolId)
    expect(settings.idleMinutesPrivileged).toBe(30)
    expect(settings.idleMinutesStaff).toBe(60)
    expect(settings.idleMinutesFamily).toBe(120)
  })

  it("gives a teacher a different limit from an accountant on the same school", async () => {
    const id = await makeSession({ lastActivity: new Date(Date.now() - 45 * MINUTE) })

    // 45 minutes idle: past the 30-minute privileged limit, inside the 60-minute staff one.
    const asAdmin = await peekSession(id, "ADMIN", schoolId)
    const asTeacher = await peekSession(id, "TEACHER", schoolId)

    expect(asAdmin!.freshness.state).toBe("IDLE_EXPIRED")
    expect(asTeacher!.freshness.state).toBe("ACTIVE")
  })
})
