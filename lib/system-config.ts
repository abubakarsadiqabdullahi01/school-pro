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
    description: "How long a sign-in lasts before it expires",
  },
]

export const SETTINGS_BY_KEY = new Map(PLATFORM_SETTINGS.map((s) => [s.key, s]))

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
