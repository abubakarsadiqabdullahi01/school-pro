/**
 * How long a sign-in survives without being used.
 *
 * The gap this closes: sessions are 30-day JWTs with an *absolute* lifetime and no idle
 * concept at all. Walk away from a signed-in machine in a staff room and it stays open for
 * a month. `LoginSession.lastActivity` has existed in the schema the whole time and was
 * never written by anything.
 *
 * Two lifetimes, and they are different questions:
 *
 *  - **Idle** — time since the session was last *used*. Short, and the one that matters for
 *    a shared machine. Different per role, because a bursar's screen showing every family's
 *    balance is not the same risk as a parent looking at one child's results.
 *  - **Absolute** — time since sign-in, regardless of use. The backstop that means a stolen
 *    token cannot be kept alive forever by a script.
 *
 * Kept pure — no Prisma, no next-auth — so the arithmetic that signs people out can be
 * tested exhaustively. The database side is `lib/session-activity.server.ts`.
 */

import type { Role } from "@prisma/client"

export type SessionSecuritySettings = {
  /** ADMIN, ACCOUNTANT and SUPER_ADMIN. They can see and move money. */
  idleMinutesPrivileged: number
  /** TEACHER. Marks and class lists. */
  idleMinutesStaff: number
  /** PARENT and STUDENT. Their own results, on their own phone. */
  idleMinutesFamily: number
  /** How long the browser warns before it signs somebody out. */
  warningSeconds: number
  /** Hard ceiling from the moment of sign-in, whatever the activity. */
  absoluteDays: number
}

/**
 * The defaults a school has before anybody configures this.
 *
 * Chosen to be defensible rather than lax, but not so tight that they become the reason
 * staff share a logged-in machine. `absoluteDays` stays at 30 to match the JWT lifetime
 * already configured in `auth.config.ts` — this feature adds an idle bound, it does not
 * quietly shorten how long anybody's sign-in lasts.
 */
export const DEFAULT_SESSION_SECURITY: SessionSecuritySettings = {
  idleMinutesPrivileged: 30,
  idleMinutesStaff: 60,
  idleMinutesFamily: 120,
  warningSeconds: 60,
  absoluteDays: 30,
}

/**
 * Zero or less means "no idle limit for this tier".
 *
 * A deliberate escape hatch: a school running a kiosk, or one that finds the warning dialog
 * disruptive, turns the feature off by setting the minutes to 0 rather than by needing a
 * separate switch that could disagree with the number next to it.
 */
export function idleLimitMinutes(role: Role, settings: SessionSecuritySettings): number {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
    case "ACCOUNTANT":
      return settings.idleMinutesPrivileged
    case "TEACHER":
      return settings.idleMinutesStaff
    case "PARENT":
    case "STUDENT":
      return settings.idleMinutesFamily
    default:
      return settings.idleMinutesPrivileged
  }
}

export type SessionFreshnessInput = {
  now: Date
  /** When this sign-in happened. */
  issuedAt: Date
  /**
   * When it was last used. Null for a session that predates this feature.
   *
   * Null must NOT expire anybody. Treating it as "idle since issuedAt" would sign out every
   * currently signed-in user the moment this deploys — the same trap the `sessionRecordId`
   * check in `lib/authz.ts` documents and avoids. Null means "first sighting": allow it,
   * and let the caller stamp the clock.
   */
  lastActivity: Date | null
  /** The stored expiry, if one was recorded at sign-in. */
  expiresAt?: Date | null
  idleMinutes: number
  absoluteDays: number
}

export type SessionState = "ACTIVE" | "IDLE_EXPIRED" | "ABSOLUTE_EXPIRED"

export type SessionFreshness = {
  state: SessionState
  /** Seconds until the idle limit bites. Null when there is no idle limit. */
  idleSecondsRemaining: number | null
  /** Seconds until the absolute ceiling. */
  absoluteSecondsRemaining: number
  /** Whichever runs out first — what a countdown should show. */
  secondsRemaining: number
  /** True the first time a session is seen, so the caller knows to stamp the clock. */
  firstSighting: boolean
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/**
 * Whether a session is still usable, and how long it has left.
 *
 * The absolute ceiling is the *earlier* of the stored `expiresAt` and `issuedAt` plus the
 * configured days. Taking the earlier matters when a school shortens the setting: sessions
 * already issued carry the old, longer `expiresAt`, and honouring that would mean the new
 * rule did not apply to anybody already signed in.
 */
export function evaluateSessionFreshness(input: SessionFreshnessInput): SessionFreshness {
  const nowMs = input.now.getTime()

  const configuredCeiling = input.issuedAt.getTime() + input.absoluteDays * DAY_MS
  const storedCeiling = input.expiresAt ? input.expiresAt.getTime() : Number.POSITIVE_INFINITY
  const ceiling = Math.min(configuredCeiling, storedCeiling)
  const absoluteSecondsRemaining = Math.max(0, Math.floor((ceiling - nowMs) / 1000))

  const idleEnabled = input.idleMinutes > 0
  const firstSighting = input.lastActivity === null

  let idleSecondsRemaining: number | null = null
  if (idleEnabled && !firstSighting) {
    const idleCeiling = input.lastActivity!.getTime() + input.idleMinutes * MINUTE_MS
    idleSecondsRemaining = Math.max(0, Math.floor((idleCeiling - nowMs) / 1000))
  }

  // Absolute first: a session past its hard ceiling is over regardless of how recently it
  // was used, and reporting it as merely idle would invite a "stay signed in" that cannot
  // work.
  const state: SessionState =
    absoluteSecondsRemaining <= 0
      ? "ABSOLUTE_EXPIRED"
      : idleSecondsRemaining !== null && idleSecondsRemaining <= 0
        ? "IDLE_EXPIRED"
        : "ACTIVE"

  const secondsRemaining =
    idleSecondsRemaining === null
      ? absoluteSecondsRemaining
      : Math.min(idleSecondsRemaining, absoluteSecondsRemaining)

  return {
    state,
    idleSecondsRemaining,
    absoluteSecondsRemaining,
    secondsRemaining,
    firstSighting,
  }
}

/**
 * Whether `lastActivity` is stale enough to be worth a write.
 *
 * Without this, every server action on every page becomes an extra UPDATE. A minute of
 * granularity is far finer than any idle limit worth setting, so the throttle costs
 * nothing real and removes a write from the hot path of the whole application.
 */
export function shouldRecordActivity(
  lastActivity: Date | null,
  now: Date,
  throttleSeconds = 60,
): boolean {
  if (lastActivity === null) return true
  return now.getTime() - lastActivity.getTime() >= throttleSeconds * 1000
}

/** Whether the browser should be showing its countdown yet. */
export function shouldWarn(freshness: SessionFreshness, settings: SessionSecuritySettings): boolean {
  if (freshness.state !== "ACTIVE") return false
  if (settings.warningSeconds <= 0) return false
  return freshness.secondsRemaining <= settings.warningSeconds
}

/** Why somebody was signed out, in words they can act on. */
export function expiryMessage(state: SessionState): string {
  switch (state) {
    case "IDLE_EXPIRED":
      return "You were signed out because the session was left unused. Please sign in again."
    case "ABSOLUTE_EXPIRED":
      return "Your session has reached its maximum length. Please sign in again."
    default:
      return ""
  }
}
