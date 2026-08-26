import { prisma } from "@/lib/db"
import { decideThrottle, windowStart, type ThrottleVerdict } from "@/lib/login-throttle"

/**
 * Counting side of the sign-in throttle. Reads the `LoginAttempt` rows that were already
 * being written and never read.
 */

const FAILED_STATUSES = ["FAILED_PASSWORD", "FAILED_CREDENTIAL", "LOCKED_OUT"] as const

/**
 * Counts recent failures and decides whether this attempt may proceed.
 *
 * `userId` is null when the identifier matched no credential — an unknown username. Only the
 * address limit applies then, which is what stops someone walking the admission-number
 * sequence.
 *
 * Never throws: if the count cannot be read, the attempt is allowed through to normal
 * password verification. Failing closed here would turn a database hiccup into a
 * school-wide sign-in outage, and the password check still stands behind it.
 */
export async function evaluateLoginThrottle(
  userId: string | null,
  ipAddress: string,
): Promise<ThrottleVerdict> {
  try {
    const since = windowStart(new Date())

    const [accountFailures, ipFailures] = await Promise.all([
      userId
        ? prisma.loginAttempt.count({
            where: { userId, status: { in: [...FAILED_STATUSES] }, attemptTime: { gte: since } },
          })
        : Promise.resolve(0),
      // "unknown" is what getClientIp falls back to when no forwarding header is present.
      // Counting it would let one unresolvable client lock out every other, so skip it.
      ipAddress && ipAddress !== "unknown"
        ? prisma.loginAttempt.count({
            where: { ipAddress, status: { in: [...FAILED_STATUSES] }, attemptTime: { gte: since } },
          })
        : Promise.resolve(0),
    ])

    return decideThrottle({ accountFailures, ipFailures })
  } catch (error) {
    console.error("Failed to evaluate login throttle — allowing the attempt through:", error)
    return { blocked: false, reason: null, message: "" }
  }
}

/** Resolves an identifier to the user it belongs to, or null if it matches nothing. */
export async function userIdForIdentifier(identifier: string): Promise<string | null> {
  try {
    const credential = await prisma.credential.findFirst({
      where: { value: identifier },
      select: { userId: true },
    })
    return credential?.userId ?? null
  } catch {
    return null
  }
}
