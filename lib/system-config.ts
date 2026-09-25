/**
 * Platform-level settings, stored in the `SystemConfiguration` table that already existed
 * and was never used.
 *
 * A caveat worth knowing: the table is keyed `@@unique([schoolId, configKey])` and
 * `schoolId` is nullable. In MySQL, NULLs do not collide in a unique index, so that
 * constraint does **not** prevent two platform-level rows sharing a key — which means
 * `upsert` cannot be relied on here. These helpers do findFirst-then-update instead.
 * Settings are written rarely by one super admin, so the race that leaves open is not
 * worth a schema change to close.
 */

export type SettingType = "STRING" | "NUMBER" | "BOOLEAN"

export interface SettingDefinition {
  key: string
  type: SettingType
  /** Used when no row exists yet. */
  fallback: string
  description: string
}

/**
 * Every platform setting the system settings screen offers. Anything not listed here is
 * rejected on save, so the screen cannot quietly accumulate keys nothing reads.
 */
export const PLATFORM_SETTINGS: SettingDefinition[] = [
  {
    key: "systemName",
    type: "STRING",
    fallback: "DigiSchool-Pro Management System",
    description: "Shown in page titles and on sign-in",
  },
  {
    key: "supportEmail",
    type: "STRING",
    fallback: "",
    description: "Where staff are told to go for help",
  },
  {
    key: "supportPhone",
    type: "STRING",
    fallback: "",
    description: "Support telephone number",
  },
  {
    key: "maintenanceMode",
    type: "BOOLEAN",
    fallback: "false",
    description: "Show the maintenance page instead of the app",
  },
  {
    key: "allowRegistration",
    type: "BOOLEAN",
    fallback: "true",
    description: "Whether new schools may be onboarded",
  },
  {
    key: "maxFileUploadSizeMb",
    type: "NUMBER",
    fallback: "1",
    description: "Upload limit in megabytes. The S3 route enforces this.",
  },
  {
    key: "defaultSessionDurationDays",
    type: "NUMBER",
    fallback: "30",
    description:
      "Maximum length of a sign-in, in days, however actively it is used. A school may set " +
      "a shorter one of its own. Shortening this applies to sessions already signed in.",
  },
]

export const SETTINGS_BY_KEY = new Map(PLATFORM_SETTINGS.map((s) => [s.key, s]))

/** Same map under the name the session loader reaches for. */
export const PLATFORM_SETTINGS_BY_KEY = SETTINGS_BY_KEY

/**
 * Settings each school decides for itself, stored in the same table with `schoolId` set.
 *
 * Kept separate from PLATFORM_SETTINGS because the two are answered by different people
 * and a key belonging to one must never be writable through the other's screen.
 */
export const SCHOOL_SETTINGS: SettingDefinition[] = [
  {
    key: "withholdResultsWhenOwing",
    type: "BOOLEAN",
    // Off, because that is how the portal behaved before this setting existed. A school
    // that upgrades must not discover its parents locked out of results overnight.
    fallback: "false",
    description: "Hide a term's results from parents and students while that term's fees are unpaid",
  },
  // --- Idle session expiry -------------------------------------------------
  // Split by role because the risk is not the same. A bursar's screen shows every family's
  // balance; a parent's shows one child's results. Zero means "no idle limit for this
  // tier", which is the documented way to turn the feature off without a second switch
  // that could disagree with the number beside it.
  {
    key: "idleTimeoutPrivilegedMinutes",
    type: "NUMBER",
    fallback: "30",
    description: "Sign out admins and accountants after this many idle minutes. 0 disables it.",
  },
  {
    key: "idleTimeoutStaffMinutes",
    type: "NUMBER",
    fallback: "60",
    description: "Sign out teachers after this many idle minutes. 0 disables it.",
  },
  {
    key: "idleTimeoutFamilyMinutes",
    type: "NUMBER",
    fallback: "120",
    description: "Sign out parents and students after this many idle minutes. 0 disables it.",
  },
  {
    key: "sessionWarningSeconds",
    type: "NUMBER",
    fallback: "60",
    description: "How many seconds of warning before an idle sign-out. 0 shows no warning.",
  },
  {
    key: "defaultSessionDurationDays",
    type: "NUMBER",
    fallback: "30",
    description: "Maximum length of a sign-in for this school, in days, however actively it is used.",
  },
]

/**
 * The keys `lib/session-activity.server.ts` loads.
 *
 * `defaultSessionDurationDays` appears in both lists on purpose: the platform sets a
 * ceiling every school inherits, and a school may set a shorter one for itself. The loader
 * reads the school's value first and falls back to the platform's.
 */
export const SESSION_SECURITY_KEYS = [
  "idleTimeoutPrivilegedMinutes",
  "idleTimeoutStaffMinutes",
  "idleTimeoutFamilyMinutes",
  "sessionWarningSeconds",
  "defaultSessionDurationDays",
] as const

export const SCHOOL_SETTINGS_BY_KEY = new Map(SCHOOL_SETTINGS.map((s) => [s.key, s]))

/** Typed key for the one setting the results screens consult. */
export const WITHHOLD_RESULTS_KEY = "withholdResultsWhenOwing"

/** Parses a stored string into the type its definition declares. */
export function parseSettingValue(
  definition: SettingDefinition,
  raw: string | undefined,
): string | number | boolean {
  const value = raw ?? definition.fallback

  switch (definition.type) {
    case "BOOLEAN":
      return value === "true"
    case "NUMBER": {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : Number(definition.fallback)
    }
    default:
      return value
  }
}

/** Serialises a value for storage, rejecting anything that does not fit its type. */
export function serialiseSettingValue(
  definition: SettingDefinition,
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  switch (definition.type) {
    case "BOOLEAN":
      if (typeof value !== "boolean") {
        return { ok: false, error: `${definition.key} must be true or false.` }
      }
      return { ok: true, value: value ? "true" : "false" }

    case "NUMBER": {
      const parsed = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { ok: false, error: `${definition.key} must be a number of 0 or more.` }
      }
      return { ok: true, value: String(parsed) }
    }

    default:
      if (typeof value !== "string") {
        return { ok: false, error: `${definition.key} must be text.` }
      }
      if (value.length > 500) {
        return { ok: false, error: `${definition.key} is too long.` }
      }
      return { ok: true, value: value.trim() }
  }
}

/** Key the backup script writes its last-run summary under. */
export const BACKUP_STATUS_KEY = "lastBackup"
