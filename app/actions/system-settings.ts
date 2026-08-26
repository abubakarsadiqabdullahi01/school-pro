"use server"

import os from "node:os"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/authz"
import { recordAudit } from "@/lib/audit"
import {
  BACKUP_STATUS_KEY,
  PLATFORM_SETTINGS,
  SETTINGS_BY_KEY,
  parseSettingValue,
  serialiseSettingValue,
} from "@/lib/system-config"

/**
 * Platform settings, health and backup status.
 *
 * All three used to be decorative: settings returned a hardcoded object and discarded
 * saves, health reported invented figures (uptime 99.9%, memory 65%, disk 45%, CPU 23%),
 * and backup returned a fake id. They now read real values, and where a real value is not
 * available they say so instead of making one up.
 */

export type SystemConfig = Record<string, string | number | boolean>

/** Platform settings are the rows with no school — `schoolId` is null. */
async function loadPlatformRows() {
  return prisma.systemConfiguration.findMany({
    where: { schoolId: null, isActive: true },
    select: { configKey: true, configValue: true },
  })
}

export async function getSystemSettings() {
  try {
    await requireRole("SUPER_ADMIN")

    const rows = await loadPlatformRows()
    const stored = new Map(rows.map((row) => [row.configKey, row.configValue]))

    const data: SystemConfig = {}
    for (const definition of PLATFORM_SETTINGS) {
      data[definition.key] = parseSettingValue(definition, stored.get(definition.key))
    }

    return {
      success: true as const,
      data,
      // So the screen can distinguish "never configured" from "configured to the default".
      configuredKeys: rows.map((row) => row.configKey),
    }
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return { success: false as const, error: "Failed to load system settings" }
  }
}

export async function updateSystemSettings(settings: Partial<SystemConfig>) {
  try {
    const actor = await requireRole("SUPER_ADMIN")

    const entries = Object.entries(settings)
    if (entries.length === 0) {
      return { success: false as const, error: "Nothing to save." }
    }

    // Unknown keys are refused rather than stored. Otherwise the table quietly accumulates
    // settings nothing reads, which is how the old screen came to promise things it never
    // did.
    const prepared: { key: string; value: string; type: string; description: string }[] = []
    for (const [key, value] of entries) {
      const definition = SETTINGS_BY_KEY.get(key)
      if (!definition) {
        return { success: false as const, error: `"${key}" is not a setting this system has.` }
      }

      const serialised = serialiseSettingValue(definition, value)
      if (!serialised.ok) {
        return { success: false as const, error: serialised.error }
      }

      prepared.push({
        key,
        value: serialised.value,
        type: definition.type,
        description: definition.description,
      })
    }

    const before = new Map((await loadPlatformRows()).map((r) => [r.configKey, r.configValue]))

    // findFirst-then-write rather than upsert: the unique key includes a nullable schoolId,
    // and MySQL does not treat NULLs as equal, so upsert cannot target these rows.
    for (const item of prepared) {
      const existing = await prisma.systemConfiguration.findFirst({
        where: { schoolId: null, configKey: item.key },
        select: { id: true },
      })

      if (existing) {
        await prisma.systemConfiguration.update({
          where: { id: existing.id },
          data: { configValue: item.value, configType: item.type, description: item.description },
        })
      } else {
        await prisma.systemConfiguration.create({
          data: {
            schoolId: null,
            configKey: item.key,
            configValue: item.value,
            configType: item.type,
            description: item.description,
            isActive: true,
          },
        })
      }
    }

    await recordAudit({
      actor,
      action: "system_settings.update",
      entityType: "SystemConfiguration",
      schoolId: null,
      summary: `Changed platform settings: ${prepared.map((p) => p.key).join(", ")}`,
      before: Object.fromEntries(prepared.map((p) => [p.key, before.get(p.key) ?? null])),
      after: Object.fromEntries(prepared.map((p) => [p.key, p.value])),
    })

    revalidatePath("/dashboard/super-admin/system")

    return {
      success: true as const,
      message: `Saved ${prepared.length} setting${prepared.length === 1 ? "" : "s"}.`,
    }
  } catch (error) {
    console.error("Error updating system settings:", error)
    return { success: false as const, error: "Failed to save system settings" }
  }
}

export async function getSystemHealth() {
  try {
    await requireRole("SUPER_ADMIN")

    let databaseHealthy = true
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      databaseHealthy = false
    }

    const [totalUsers, totalSchools, activeSessions, recentLogins, failedLogins] =
      await Promise.all([
        prisma.user.count(),
        prisma.school.count(),
        prisma.loginSession.count({ where: { expiresAt: { gt: new Date() }, revokedAt: null } }),
        prisma.loginAttempt.count({
          where: {
            attemptTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            status: "SUCCESS",
          },
        }),
        prisma.loginAttempt.count({
          where: {
            attemptTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            status: { in: ["FAILED_PASSWORD", "FAILED_CREDENTIAL", "LOCKED_OUT"] },
          },
        }),
      ])

    const memory = process.memoryUsage()
    const totalMemory = os.totalmem()

    return {
      success: true as const,
      data: {
        database: {
          status: databaseHealthy ? "healthy" : "unhealthy",
          totalUsers,
          totalSchools,
          activeSessions,
        },
        process: {
          // Real figures, from this Node process. Note these describe the app process, not
          // the server — on shared hosting the two are very different things.
          uptimeSeconds: Math.floor(process.uptime()),
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          rssMb: Math.round(memory.rss / 1024 / 1024),
          totalMemoryMb: Math.round(totalMemory / 1024 / 1024),
          // os.loadavg() is meaningful on Linux and returns zeroes on Windows.
          loadAverage: os.platform() === "win32" ? null : os.loadavg()[0],
          // Disk and CPU percentages are not obtainable from Node without native modules.
          // They were previously reported as invented constants; now they are simply absent.
          diskUsage: null,
          cpuUsage: null,
        },
        activity: {
          successfulLogins24h: recentLogins,
          failedLogins24h: failedLogins,
        },
      },
    }
  } catch (error) {
    console.error("Error fetching system health:", error)
    return { success: false as const, error: "Failed to load system health" }
  }
}

/**
 * Reports the last backup, which `scripts/backup-database.ts` records after each run.
 *
 * Backups are a scheduled job, not something an app request can perform — the app process
 * on shared hosting has no business shelling out to mysqldump, and a request that took as
 * long as a full dump would time out. So this reads status rather than starting anything,
 * which is why it is no longer called "perform".
 */
export async function getBackupStatus() {
  try {
    await requireRole("SUPER_ADMIN")

    const row = await prisma.systemConfiguration.findFirst({
      where: { schoolId: null, configKey: BACKUP_STATUS_KEY },
      select: { configValue: true, updatedAt: true },
    })

    if (!row) {
      return {
        success: true as const,
        data: {
          configured: false,
          lastBackupAt: null,
          detail:
            "No backup has been recorded. Schedule scripts/backup-database.ts as a cron " +
            "job — see documentation/backup-and-restore.md.",
        },
      }
    }

    let parsed: { completedAt?: string; sizeBytes?: number; file?: string } = {}
    try {
      parsed = JSON.parse(row.configValue)
    } catch {
      // Stored by an older or hand-edited run; the timestamp on the row is still useful.
    }

    return {
      success: true as const,
      data: {
        configured: true,
        lastBackupAt: parsed.completedAt ?? row.updatedAt.toISOString(),
        sizeBytes: parsed.sizeBytes ?? null,
        file: parsed.file ?? null,
        detail: "Backups run on a schedule. This is the most recent one recorded.",
      },
    }
  } catch (error) {
    console.error("Error reading backup status:", error)
    return { success: false as const, error: "Failed to read backup status" }
  }
}
