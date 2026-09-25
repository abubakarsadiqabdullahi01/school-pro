import { unstable_cache } from "next/cache"
import type { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  DEFAULT_SESSION_SECURITY,
  evaluateSessionFreshness,
  idleLimitMinutes,
  shouldRecordActivity,
  type SessionFreshness,
  type SessionSecuritySettings,
} from "@/lib/session-policy"
import {
  SESSION_SECURITY_KEYS,
  parseSettingValue,
  SCHOOL_SETTINGS_BY_KEY,
  PLATFORM_SETTINGS_BY_KEY,
} from "@/lib/system-config"

/**
 * Server-only half of idle session expiry: loading the school's limits, reading the clock,
 * and writing it.
 *
 * Split from `lib/session-policy.ts` for the same reason `lib/grading.server.ts` is split
 * from `lib/grading.ts` — `next/cache` cannot be imported into a unit test, and the
 * arithmetic that signs people out deserves to be tested without a database.
 *
 * The distinction that runs through this file is **touch versus peek**:
 *
 *  - `touchSession` is what every server action goes through. Using the application is
 *    activity, so it stamps the clock.
 *  - `peekSession` is what the browser's countdown polls. Asking "how long have I got"
 *    must *not* reset the answer, or the session would never expire while a tab is open —
 *    which is exactly the bug that makes idle timeouts theatre.
 */

const SETTINGS_TAG = "session-security"

type SecurityRow = { configKey: string; configValue: string }

function settingsFromRows(rows: SecurityRow[], platformRows: SecurityRow[]): SessionSecuritySettings {
  const school = new Map(rows.map((row) => [row.configKey, row.configValue]))
  const platform = new Map(platformRows.map((row) => [row.configKey, row.configValue]))

  const read = (key: (typeof SESSION_SECURITY_KEYS)[number], fallback: number): number => {
    const definition = SCHOOL_SETTINGS_BY_KEY.get(key) ?? PLATFORM_SETTINGS_BY_KEY.get(key)
    if (!definition) return fallback
    // School value first, then the platform default, then the built-in.
    const raw = school.get(key) ?? platform.get(key)
    if (raw === undefined) return fallback
    const parsed = parseSettingValue(definition, raw)
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    idleMinutesPrivileged: read("idleTimeoutPrivilegedMinutes", DEFAULT_SESSION_SECURITY.idleMinutesPrivileged),
    idleMinutesStaff: read("idleTimeoutStaffMinutes", DEFAULT_SESSION_SECURITY.idleMinutesStaff),
    idleMinutesFamily: read("idleTimeoutFamilyMinutes", DEFAULT_SESSION_SECURITY.idleMinutesFamily),
    warningSeconds: read("sessionWarningSeconds", DEFAULT_SESSION_SECURITY.warningSeconds),
    absoluteDays: read("defaultSessionDurationDays", DEFAULT_SESSION_SECURITY.absoluteDays),
  }
}

/**
 * A school's session limits, cached for a minute.
 *
 * Short on purpose: this is read on effectively every request, and an administrator
 * tightening the timeout after an incident should not have to wait an hour for it. The
 * `session-security` tag revalidates it immediately when the setting is saved.
 */
const loadSettings = unstable_cache(
  async (schoolId: string | null): Promise<SessionSecuritySettings> => {
    try {
      const keys = [...SESSION_SECURITY_KEYS]
      const [schoolRows, platformRows] = await Promise.all([
        schoolId
          ? prisma.systemConfiguration.findMany({
              where: { schoolId, configKey: { in: keys }, isActive: true },
              select: { configKey: true, configValue: true },
            })
          : Promise.resolve([] as SecurityRow[]),
        prisma.systemConfiguration.findMany({
          where: { schoolId: null, configKey: { in: keys }, isActive: true },
          select: { configKey: true, configValue: true },
        }),
      ])
      return settingsFromRows(schoolRows, platformRows)
    } catch (error) {
      // A transient read failure must not sign the whole school out. Falling back to the
      // documented defaults is the safe direction: the session stays governed, and by
      // limits nobody can be surprised by.
      console.error("Failed to load session security settings", schoolId, error)
      return DEFAULT_SESSION_SECURITY
    }
  },
  ["session-security"],
  { revalidate: 60, tags: [SETTINGS_TAG] },
)

export { SETTINGS_TAG as SESSION_SECURITY_TAG }

export async function getSessionSecurity(schoolId: string | null): Promise<SessionSecuritySettings> {
  return loadSettings(schoolId)
}

export type SessionCheck = {
  freshness: SessionFreshness
  settings: SessionSecuritySettings
  idleMinutes: number
}

type SessionRow = {
  id: string
  issuedAt: Date
  expiresAt: Date
  lastActivity: Date | null
  revokedAt: Date | null
}

async function loadSession(sessionRecordId: string): Promise<SessionRow | null> {
  return prisma.loginSession.findUnique({
    where: { id: sessionRecordId },
    select: { id: true, issuedAt: true, expiresAt: true, lastActivity: true, revokedAt: true },
  })
}

function check(row: SessionRow, role: Role, settings: SessionSecuritySettings, now: Date): SessionCheck {
  const idleMinutes = idleLimitMinutes(role, settings)
  return {
    settings,
    idleMinutes,
    freshness: evaluateSessionFreshness({
      now,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      lastActivity: row.lastActivity,
      idleMinutes,
      absoluteDays: settings.absoluteDays,
    }),
  }
}

export type TouchResult =
  | { ok: true; check: SessionCheck }
  | { ok: false; reason: string; state: "REVOKED" | "IDLE_EXPIRED" | "ABSOLUTE_EXPIRED" }

/**
 * Reads a session, decides whether it is still alive, and stamps the clock if it is.
 *
 * Called from `requireActor`, which means every server action. Two things keep that cheap:
 * the settings read is cached, and the `lastActivity` write is throttled to once a minute
 * — far finer than any idle limit worth setting, and it keeps an UPDATE off the hot path
 * of the whole application.
 *
 * An expired session is **revoked**, not merely rejected. Without that the token stays
 * usable the moment the clock is touched by anything else, and "signed out for inactivity"
 * would not mean signed out.
 */
export async function touchSession(
  sessionRecordId: string,
  role: Role,
  schoolId: string | null,
  now: Date = new Date(),
): Promise<TouchResult> {
  const [row, settings] = await Promise.all([
    loadSession(sessionRecordId),
    getSessionSecurity(schoolId),
  ])

  // A token whose session row has gone is treated the way `requireActor` already treats a
  // missing row: no per-session check. Deleting login history must not sign people out.
  if (!row) {
    return {
      ok: true,
      check: {
        settings,
        idleMinutes: idleLimitMinutes(role, settings),
        freshness: evaluateSessionFreshness({
          now,
          issuedAt: now,
          lastActivity: now,
          idleMinutes: 0,
          absoluteDays: settings.absoluteDays,
        }),
      },
    }
  }

  if (row.revokedAt) {
    return {
      ok: false,
      state: "REVOKED",
      reason: "This session has been signed out. Please sign in again.",
    }
  }

  const result = check(row, role, settings, now)

  if (result.freshness.state !== "ACTIVE") {
    await revoke(sessionRecordId)
    return {
      ok: false,
      state: result.freshness.state,
      reason:
        result.freshness.state === "IDLE_EXPIRED"
          ? "You were signed out because the session was left unused. Please sign in again."
          : "Your session has reached its maximum length. Please sign in again.",
    }
  }

  if (shouldRecordActivity(row.lastActivity, now)) {
    await stamp(sessionRecordId, now)
  }

  return { ok: true, check: result }
}

/**
 * How long a session has left, **without** counting the asking as activity.
 *
 * The browser's countdown polls this. If it went through `touchSession` the session would
 * be kept alive by the very thing measuring it, and nobody would ever be signed out.
 */
export async function peekSession(
  sessionRecordId: string,
  role: Role,
  schoolId: string | null,
  now: Date = new Date(),
): Promise<SessionCheck | null> {
  const [row, settings] = await Promise.all([
    loadSession(sessionRecordId),
    getSessionSecurity(schoolId),
  ])
  if (!row || row.revokedAt) return null
  return check(row, role, settings, now)
}

/** Deliberately extends a session — what "Stay signed in" does. */
export async function keepSessionAlive(
  sessionRecordId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await loadSession(sessionRecordId)
  // Refusing here is the point: once a session is over, a button cannot bring it back.
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return false
  await stamp(sessionRecordId, now)
  return true
}

async function stamp(sessionRecordId: string, now: Date): Promise<void> {
  try {
    await prisma.loginSession.updateMany({
      where: { id: sessionRecordId, revokedAt: null },
      data: { lastActivity: now },
    })
  } catch (error) {
    // Never fail a user's action because the activity stamp could not be written. The
    // worst case is an earlier-than-necessary sign-out, not a broken page.
    console.error("Failed to record session activity", sessionRecordId, error)
  }
}

async function revoke(sessionRecordId: string): Promise<void> {
  try {
    await prisma.loginSession.updateMany({
      where: { id: sessionRecordId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  } catch (error) {
    console.error("Failed to revoke an expired session", sessionRecordId, error)
  }
}
