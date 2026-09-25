"use server"

import { revalidatePath, updateTag } from "next/cache"
import { z } from "zod"

import { auth } from "@/auth"
import { recordAudit } from "@/lib/audit"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import {
  SESSION_SECURITY_TAG,
  getSessionSecurity,
  keepSessionAlive,
  peekSession,
} from "@/lib/session-activity.server"
import { DEFAULT_SESSION_SECURITY, type SessionSecuritySettings } from "@/lib/session-policy"
import { SCHOOL_SETTINGS_BY_KEY, serialiseSettingValue } from "@/lib/system-config"

/**
 * The browser's half of idle session expiry.
 *
 * One rule shapes this whole file, and breaking it would make the feature pointless:
 *
 *   **Asking how long is left must not extend how long is left.**
 *
 * `heartbeat` therefore goes through `auth()` and `peekSession`, never `requireActor` —
 * which stamps the activity clock on every call. A countdown built on `requireActor` would
 * reset the timer every few seconds and nobody would ever be signed out.
 *
 * `staySignedIn` is the deliberate opposite: it exists to extend the session, and it is
 * called only when a person clicks the button.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type SessionHeartbeat = {
  /** False once the session is over — the browser should redirect to sign-in. */
  alive: boolean
  /** Seconds until sign-out. Null when nothing is counting down. */
  secondsRemaining: number | null
  /** Seconds of warning the school has configured. */
  warningSeconds: number
  /** The idle limit in minutes for this user's role. 0 means idle expiry is off. */
  idleMinutes: number
  reason?: string
}

/**
 * How long this sign-in has left, without counting the question as activity.
 *
 * Deliberately returns a shape rather than throwing on an ended session: the caller is a
 * polling client component, and an exception every few seconds after sign-out would fill
 * the console with noise for something entirely expected.
 */
export async function sessionHeartbeat(): Promise<SessionHeartbeat> {
  const session = await auth()
  const userId = session?.user?.id
  const sessionRecordId = session?.user?.sessionRecordId

  if (!userId) {
    return { alive: false, secondsRemaining: 0, warningSeconds: 0, idleMinutes: 0 }
  }

  // A token issued before per-session records existed. Nothing to count down, and it must
  // not be treated as expired — the same reasoning as everywhere else in this feature.
  if (!sessionRecordId) {
    return { alive: true, secondsRemaining: null, warningSeconds: 0, idleMinutes: 0 }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      admin: { select: { schoolId: true } },
      teacher: { select: { schoolId: true } },
      parent: { select: { schoolId: true } },
      student: { select: { schoolId: true } },
    },
  })

  if (!user || !user.isActive) {
    return {
      alive: false,
      secondsRemaining: 0,
      warningSeconds: 0,
      idleMinutes: 0,
      reason: "This account is no longer active.",
    }
  }

  const schoolId =
    user.admin?.schoolId ?? user.teacher?.schoolId ?? user.parent?.schoolId ?? user.student?.schoolId ?? null

  const check = await peekSession(sessionRecordId, user.role, schoolId)
  if (!check) {
    return {
      alive: false,
      secondsRemaining: 0,
      warningSeconds: 0,
      idleMinutes: 0,
      reason: "This session has been signed out. Please sign in again.",
    }
  }

  if (check.freshness.state !== "ACTIVE") {
    return {
      alive: false,
      secondsRemaining: 0,
      warningSeconds: check.settings.warningSeconds,
      idleMinutes: check.idleMinutes,
      reason:
        check.freshness.state === "IDLE_EXPIRED"
          ? "You were signed out because the session was left unused."
          : "Your session has reached its maximum length.",
    }
  }

  return {
    alive: true,
    secondsRemaining: check.freshness.secondsRemaining,
    warningSeconds: check.settings.warningSeconds,
    idleMinutes: check.idleMinutes,
  }
}

/**
 * Extends the session. The "Stay signed in" button, and nothing else.
 *
 * Returns false for a session that is already over: once the clock has run out a button
 * cannot bring it back, and pretending otherwise would leave somebody clicking a control
 * that silently does nothing.
 */
export async function staySignedIn(): Promise<{ success: boolean }> {
  const session = await auth()
  const sessionRecordId = session?.user?.sessionRecordId
  if (!session?.user?.id || !sessionRecordId) return { success: false }
  return { success: await keepSessionAlive(sessionRecordId) }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const securitySchema = z.object({
  idleMinutesPrivileged: z.coerce.number().int().min(0).max(1440),
  idleMinutesStaff: z.coerce.number().int().min(0).max(1440),
  idleMinutesFamily: z.coerce.number().int().min(0).max(1440),
  warningSeconds: z.coerce.number().int().min(0).max(600),
  absoluteDays: z.coerce.number().int().min(1).max(365),
})

const KEY_BY_FIELD: Record<keyof SessionSecuritySettings, string> = {
  idleMinutesPrivileged: "idleTimeoutPrivilegedMinutes",
  idleMinutesStaff: "idleTimeoutStaffMinutes",
  idleMinutesFamily: "idleTimeoutFamilyMinutes",
  warningSeconds: "sessionWarningSeconds",
  absoluteDays: "defaultSessionDurationDays",
}

export async function getSchoolSessionSecurity(): Promise<ActionResult<SessionSecuritySettings>> {
  try {
    const actor = await requirePermission("school.manage")
    return { success: true, data: await getSessionSecurity(actor.schoolId) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load the session settings",
    }
  }
}

export async function saveSchoolSessionSecurity(
  input: unknown,
): Promise<ActionResult<SessionSecuritySettings>> {
  try {
    const actor = await requirePermission("school.manage")
    if (!actor.schoolId) throw new Error("Select a school before setting session limits")

    const data = securitySchema.parse(input)
    const before = await getSessionSecurity(actor.schoolId)

    for (const [field, key] of Object.entries(KEY_BY_FIELD)) {
      const definition = SCHOOL_SETTINGS_BY_KEY.get(key)
      if (!definition) continue
      const serialised = serialiseSettingValue(definition, data[field as keyof typeof data])
      if (!serialised.ok) throw new Error(serialised.error)

      // findFirst-then-write rather than upsert: `SystemConfiguration` is keyed
      // `[schoolId, configKey]` with a nullable schoolId, and the school settings actions
      // already take this route. Keeping to it means one pattern for this table.
      const existing = await prisma.systemConfiguration.findFirst({
        where: { schoolId: actor.schoolId, configKey: key },
        select: { id: true },
      })

      if (existing) {
        await prisma.systemConfiguration.update({
          where: { id: existing.id },
          data: { configValue: serialised.value, isActive: true },
        })
      } else {
        await prisma.systemConfiguration.create({
          data: {
            schoolId: actor.schoolId,
            configKey: key,
            configValue: serialised.value,
            configType: definition.type,
            description: definition.description,
          },
        })
      }
    }

    await recordAudit({
      actor,
      action: "school.session_security.update",
      entityType: "SystemConfiguration",
      entityId: actor.schoolId,
      summary: `Idle timeouts set to ${data.idleMinutesPrivileged}/${data.idleMinutesStaff}/${data.idleMinutesFamily} minutes`,
      before,
      after: data,
    })

    // `updateTag`, not `revalidateTag(tag, "max")` as the compiler actions use: that one
    // serves stale content while it refreshes, which is right for a result sheet and wrong
    // for a security limit. An administrator tightening this after an incident must not be
    // told the old number is still in force.
    updateTag(SESSION_SECURITY_TAG)
    revalidatePath("/dashboard/admin/school-settings")

    return { success: true, data: { ...DEFAULT_SESSION_SECURITY, ...data } }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const [issue] = error.issues
      return { success: false, error: issue?.message ?? "Those session limits are not valid" }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save the session settings",
    }
  }
}
