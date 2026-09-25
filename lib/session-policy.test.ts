import { describe, expect, it } from "vitest"
import {
  DEFAULT_SESSION_SECURITY,
  evaluateSessionFreshness,
  expiryMessage,
  idleLimitMinutes,
  shouldRecordActivity,
  shouldWarn,
  type SessionSecuritySettings,
} from "@/lib/session-policy"

/**
 * Idle session expiry.
 *
 * The cases that matter are the ones that would either lock everybody out or nobody:
 * a session this feature has never seen before, a school that turns the limit off, and the
 * boundary second in each direction.
 */

const NOW = new Date("2026-09-25T12:00:00.000Z")

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000)
}

function settings(overrides: Partial<SessionSecuritySettings> = {}): SessionSecuritySettings {
  return { ...DEFAULT_SESSION_SECURITY, ...overrides }
}

function freshness(overrides: Partial<Parameters<typeof evaluateSessionFreshness>[0]> = {}) {
  return evaluateSessionFreshness({
    now: NOW,
    issuedAt: minutesAgo(120),
    lastActivity: minutesAgo(5),
    idleMinutes: 30,
    absoluteDays: 30,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// The deployment-safety case
// ---------------------------------------------------------------------------

describe("a session this feature has never seen", () => {
  it("is active, not expired", () => {
    // Every session signed in before this shipped has lastActivity = null. Treating null
    // as "idle since issuedAt" would sign out every logged-in user on deploy.
    const result = freshness({ lastActivity: null, issuedAt: daysAgo(20) })
    expect(result.state).toBe("ACTIVE")
  })

  it("reports itself so the caller knows to stamp the clock", () => {
    expect(freshness({ lastActivity: null }).firstSighting).toBe(true)
    expect(freshness({ lastActivity: minutesAgo(1) }).firstSighting).toBe(false)
  })

  it("has no idle countdown to report yet", () => {
    expect(freshness({ lastActivity: null }).idleSecondsRemaining).toBeNull()
  })

  it("is still subject to the absolute ceiling", () => {
    // Never-seen must not mean immortal.
    const result = freshness({ lastActivity: null, issuedAt: daysAgo(31), absoluteDays: 30 })
    expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })
})

// ---------------------------------------------------------------------------
// Idle expiry
// ---------------------------------------------------------------------------

describe("idle expiry", () => {
  it("keeps a session used a moment ago", () => {
    expect(freshness({ lastActivity: minutesAgo(1), idleMinutes: 30 }).state).toBe("ACTIVE")
  })

  it("expires a session left unused past the limit", () => {
    expect(freshness({ lastActivity: minutesAgo(31), idleMinutes: 30 }).state).toBe("IDLE_EXPIRED")
  })

  it("treats the boundary second as expired", () => {
    // At exactly the limit there are zero seconds left, and zero seconds left is over.
    expect(freshness({ lastActivity: minutesAgo(30), idleMinutes: 30 }).state).toBe("IDLE_EXPIRED")
    expect(freshness({ lastActivity: minutesAgo(29), idleMinutes: 30 }).state).toBe("ACTIVE")
  })

  it("counts down in seconds", () => {
    expect(freshness({ lastActivity: minutesAgo(25), idleMinutes: 30 }).idleSecondsRemaining).toBe(300)
  })

  it("never reports a negative countdown", () => {
    expect(freshness({ lastActivity: minutesAgo(500), idleMinutes: 30 }).idleSecondsRemaining).toBe(0)
  })
})

describe("turning the idle limit off", () => {
  it("never expires on idleness when the limit is zero", () => {
    const result = freshness({ lastActivity: daysAgo(10), idleMinutes: 0 })
    expect(result.state).toBe("ACTIVE")
    expect(result.idleSecondsRemaining).toBeNull()
  })

  it("still applies the absolute ceiling with the idle limit off", () => {
    expect(freshness({ lastActivity: minutesAgo(1), idleMinutes: 0, issuedAt: daysAgo(40) }).state).toBe(
      "ABSOLUTE_EXPIRED",
    )
  })
})

// ---------------------------------------------------------------------------
// The absolute ceiling
// ---------------------------------------------------------------------------

describe("the absolute ceiling", () => {
  it("expires a long-lived session however recently it was used", () => {
    const result = freshness({ issuedAt: daysAgo(31), lastActivity: minutesAgo(1), absoluteDays: 30 })
    expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })

  it("is reported ahead of idleness when both have run out", () => {
    // A session past its hard ceiling cannot be rescued by "stay signed in", so saying it
    // is merely idle would offer a button that could not work.
    const result = freshness({ issuedAt: daysAgo(40), lastActivity: daysAgo(5), absoluteDays: 30 })
    expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })

  it("honours a shortened setting for sessions already issued", () => {
    // The stored expiresAt says 30 days; the school has since set 7. The shorter wins, or
    // the new rule would apply to nobody currently signed in.
    const result = freshness({
      issuedAt: daysAgo(10),
      lastActivity: minutesAgo(1),
      expiresAt: new Date(NOW.getTime() + 20 * 86_400_000),
      absoluteDays: 7,
    })
    expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })

  it("honours a stored expiry shorter than the configured days", () => {
    const result = freshness({
      issuedAt: daysAgo(1),
      lastActivity: minutesAgo(1),
      expiresAt: minutesAgo(1),
      absoluteDays: 30,
    })
    expect(result.state).toBe("ABSOLUTE_EXPIRED")
  })
})

describe("secondsRemaining", () => {
  it("reports whichever limit runs out first", () => {
    const idleSooner = freshness({ lastActivity: minutesAgo(29), idleMinutes: 30, issuedAt: daysAgo(1) })
    expect(idleSooner.secondsRemaining).toBe(60)

    const absoluteSooner = freshness({
      lastActivity: minutesAgo(1),
      idleMinutes: 600,
      issuedAt: daysAgo(30),
      absoluteDays: 30,
    })
    expect(absoluteSooner.secondsRemaining).toBe(0)
  })

  it("falls back to the absolute countdown when idleness is not limited", () => {
    const result = freshness({ idleMinutes: 0, issuedAt: daysAgo(29), absoluteDays: 30 })
    expect(result.secondsRemaining).toBe(result.absoluteSecondsRemaining)
  })
})

// ---------------------------------------------------------------------------
// Per-role limits
// ---------------------------------------------------------------------------

describe("idleLimitMinutes", () => {
  const s = settings({ idleMinutesPrivileged: 15, idleMinutesStaff: 45, idleMinutesFamily: 90 })

  it("gives money-handling roles the shortest limit", () => {
    expect(idleLimitMinutes("ADMIN", s)).toBe(15)
    expect(idleLimitMinutes("ACCOUNTANT", s)).toBe(15)
    expect(idleLimitMinutes("SUPER_ADMIN", s)).toBe(15)
  })

  it("gives teachers their own limit", () => {
    expect(idleLimitMinutes("TEACHER", s)).toBe(45)
  })

  it("gives families the longest", () => {
    expect(idleLimitMinutes("PARENT", s)).toBe(90)
    expect(idleLimitMinutes("STUDENT", s)).toBe(90)
  })

  it("defaults an unrecognised role to the strictest tier", () => {
    expect(idleLimitMinutes("SOMETHING_NEW" as never, s)).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// Write throttling
// ---------------------------------------------------------------------------

describe("shouldRecordActivity", () => {
  it("always writes the first sighting", () => {
    expect(shouldRecordActivity(null, NOW)).toBe(true)
  })

  it("skips a write for a session touched seconds ago", () => {
    // Otherwise every server action on every page adds an UPDATE to the hot path.
    expect(shouldRecordActivity(new Date(NOW.getTime() - 5_000), NOW, 60)).toBe(false)
  })

  it("writes once the throttle has elapsed", () => {
    expect(shouldRecordActivity(new Date(NOW.getTime() - 60_000), NOW, 60)).toBe(true)
  })

  it("stays far finer than any idle limit worth setting", () => {
    expect(shouldRecordActivity(new Date(NOW.getTime() - 61_000), NOW)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The warning
// ---------------------------------------------------------------------------

describe("shouldWarn", () => {
  it("warns inside the warning window", () => {
    expect(shouldWarn(freshness({ lastActivity: minutesAgo(29.5) }), settings({ warningSeconds: 60 }))).toBe(true)
  })

  it("stays quiet outside it", () => {
    expect(shouldWarn(freshness({ lastActivity: minutesAgo(10) }), settings({ warningSeconds: 60 }))).toBe(false)
  })

  it("does not warn about a session that is already over", () => {
    expect(shouldWarn(freshness({ lastActivity: minutesAgo(60) }), settings({ warningSeconds: 60 }))).toBe(false)
  })

  it("can be switched off", () => {
    expect(shouldWarn(freshness({ lastActivity: minutesAgo(29.9) }), settings({ warningSeconds: 0 }))).toBe(false)
  })
})

describe("expiryMessage", () => {
  it("explains idleness and length differently", () => {
    expect(expiryMessage("IDLE_EXPIRED")).toContain("left unused")
    expect(expiryMessage("ABSOLUTE_EXPIRED")).toContain("maximum length")
  })

  it("says nothing about a live session", () => {
    expect(expiryMessage("ACTIVE")).toBe("")
  })
})
