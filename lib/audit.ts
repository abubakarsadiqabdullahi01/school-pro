import { headers } from "next/headers"
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import type { Actor } from "@/lib/authz"

/**
 * Writing to the audit log.
 *
 * Rules:
 *  - **Never let an audit failure fail the business action.** A teacher must not lose a
 *    class's scores because the audit table is unavailable. Failures are logged loudly and
 *    swallowed.
 *  - Record the action *after* it has succeeded, so the log does not claim things that were
 *    rolled back.
 *  - `summary` is read by people, not machines. Write it the way a head teacher would say
 *    it: "Saved 32 scores for JSS 1A Mathematics, 2nd Term".
 *  - Keep `before`/`after` to the fields that actually changed. This is not a row copy.
 */

export interface AuditEntry {
  actor: Actor
  /** Dotted verb: "assessment.save", "student.promote", "term.set_current". */
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  /** The school the action affected. Defaults to the actor's own school. */
  schoolId?: string | null
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
}

/** Best-effort client IP, matching how `auth.ts` resolves it behind cPanel or Cloudflare. */
async function clientIp(): Promise<string | null> {
  try {
    const header = await headers()
    const forwardedFor = header.get("x-forwarded-for")
    if (forwardedFor) {
      const client = forwardedFor.split(",")[0]?.trim()
      if (client) return client
    }
    return header.get("cf-connecting-ip") ?? header.get("x-real-ip") ?? null
  } catch {
    // `headers()` throws outside a request scope — a seed script, say. Not worth failing for.
    return null
  }
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId: entry.schoolId ?? entry.actor.schoolId,
        actorId: entry.actor.userId,
        actorName: entry.actor.name,
        actorRole: entry.actor.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        // The column is VarChar(500); truncate rather than throw on a long summary.
        summary: entry.summary.slice(0, 500),
        before: entry.before,
        after: entry.after,
        ipAddress: await clientIp(),
      },
    })
  } catch (error) {
    // Deliberately swallowed — see the note at the top of this file.
    console.error("Failed to write audit log entry:", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error,
    })
  }
}
