/**
 * Brute-force protection for sign-in.
 *
 * `AttemptStatus.LOCKED_OUT` was declared in the schema and used nowhere: every attempt was
 * faithfully written to `LoginAttempt` and nothing ever read it back. That matters more here
 * than in most applications, because student usernames are admission numbers — sequential,
 * and printed on every document a student carries.
 *
 * This is a **sliding window**, not a locked flag: failures age out, so there is no row to
 * clear and no admin action needed to release a legitimate user. The trade-off is that a
 * determined attacker can keep trying at the permitted rate indefinitely — acceptable,
 * because the rate is far below what guessing a password needs.
 *
 * Pure by design so the decision is testable; the counting queries live in
 * `lib/login-throttle.server.ts` (`lib/db.ts` connects on import, which a unit test should
 * not do).
 */

/** Failures against one account before it stops accepting attempts. */
export const MAX_FAILURES_PER_ACCOUNT = 5

/**
 * Failures from one address before it stops, across all accounts. Set well above the
 * per-account limit so a school behind one NAT address is not locked out by a few people
 * mistyping passwords, but low enough to stop admission-number enumeration.
 */
export const MAX_FAILURES_PER_IP = 30

export const WINDOW_MINUTES = 15

export interface ThrottleCounts {
  /** Failed attempts against this account inside the window. */
  accountFailures: number
  /** Failed attempts from this address inside the window, across all accounts. */
  ipFailures: number
}

export interface ThrottleVerdict {
  blocked: boolean
  reason: "account" | "address" | null
  /** What to tell the person trying to sign in. Empty when not blocked. */
  message: string
}

const ALLOWED: ThrottleVerdict = { blocked: false, reason: null, message: "" }

/**
 * Decides whether an attempt may proceed.
 *
 * The account limit is checked first, so a user who has genuinely mistyped their password
 * gets the message about their own account rather than one about their network.
 */
export function decideThrottle(counts: ThrottleCounts): ThrottleVerdict {
  if (counts.accountFailures >= MAX_FAILURES_PER_ACCOUNT) {
    return {
      blocked: true,
      reason: "account",
      message:
        `Too many failed sign-in attempts. For security, this account is paused for ` +
        `${WINDOW_MINUTES} minutes. If you have forgotten your password, ask your school ` +
        `administrator to reset it.`,
    }
  }

  if (counts.ipFailures >= MAX_FAILURES_PER_IP) {
    return {
      blocked: true,
      reason: "address",
      message:
        `Too many failed sign-in attempts from this network. Try again in ` +
        `${WINDOW_MINUTES} minutes.`,
    }
  }

  return ALLOWED
}

/** The start of the sliding window, given the current time. */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000)
}
