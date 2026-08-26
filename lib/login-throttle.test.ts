import { describe, expect, it } from "vitest"
import {
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_IP,
  WINDOW_MINUTES,
  decideThrottle,
  windowStart,
} from "@/lib/login-throttle"

/**
 * The sign-in throttle decision. `AttemptStatus.LOCKED_OUT` was declared and used nowhere
 * before this — every attempt was recorded and nothing read it back.
 */

describe("decideThrottle", () => {
  it("allows an attempt with no recent failures", () => {
    expect(decideThrottle({ accountFailures: 0, ipFailures: 0 })).toEqual({
      blocked: false,
      reason: null,
      message: "",
    })
  })

  it("allows attempts right up to the account limit", () => {
    const verdict = decideThrottle({
      accountFailures: MAX_FAILURES_PER_ACCOUNT - 1,
      ipFailures: 0,
    })
    expect(verdict.blocked).toBe(false)
  })

  it("blocks at the account limit, not one past it", () => {
    const verdict = decideThrottle({ accountFailures: MAX_FAILURES_PER_ACCOUNT, ipFailures: 0 })
    expect(verdict.blocked).toBe(true)
    expect(verdict.reason).toBe("account")
  })

  it("blocks on address volume even when no single account is over its limit", () => {
    // This is the case that stops someone walking the admission-number sequence: each
    // account has one failure, but the address has hundreds.
    const verdict = decideThrottle({ accountFailures: 1, ipFailures: MAX_FAILURES_PER_IP })
    expect(verdict.blocked).toBe(true)
    expect(verdict.reason).toBe("address")
  })

  it("reports the account reason first when both limits are exceeded", () => {
    // A user who mistyped their own password should be told about their account, not
    // about their school's network.
    const verdict = decideThrottle({
      accountFailures: MAX_FAILURES_PER_ACCOUNT,
      ipFailures: MAX_FAILURES_PER_IP,
    })
    expect(verdict.reason).toBe("account")
  })

  it("tells a locked-out user how long to wait and what to do next", () => {
    const verdict = decideThrottle({ accountFailures: MAX_FAILURES_PER_ACCOUNT, ipFailures: 0 })
    expect(verdict.message).toContain(String(WINDOW_MINUTES))
    expect(verdict.message).toMatch(/administrator/i)
  })

  it("keeps the address limit well above the account limit", () => {
    // A whole school behind one NAT address must not be locked out by a few people
    // mistyping their passwords.
    expect(MAX_FAILURES_PER_IP).toBeGreaterThan(MAX_FAILURES_PER_ACCOUNT * 3)
  })

  it("says nothing when it is not blocking", () => {
    expect(decideThrottle({ accountFailures: 2, ipFailures: 2 }).message).toBe("")
  })
})

describe("windowStart", () => {
  it("looks back exactly the window length", () => {
    const now = new Date("2026-08-25T12:00:00.000Z")
    expect(windowStart(now).toISOString()).toBe("2026-08-25T11:45:00.000Z")
  })

  it("is a sliding window, so failures age out without anything being cleared", () => {
    const now = new Date("2026-08-25T12:00:00.000Z")
    const older = new Date("2026-08-25T11:44:00.000Z")
    // One minute outside the window: no longer counted, no admin action needed.
    expect(older.getTime()).toBeLessThan(windowStart(now).getTime())
  })
})
