import { prisma } from "@/lib/db"

/**
 * Revoking sign-ins.
 *
 * `LoginSession.revokedAt` existed and was never written, so there was no way to end a
 * session: with 30-day JWTs, deactivating a user left their token working until it expired.
 *
 * These functions write it. `requireActor` reads it on every server action, so a revoked
 * session stops being able to do anything — though the token itself stays cryptographically
 * valid until it expires, which is the nature of stateless sessions.
 */

/** Ends one specific sign-in. Used when a user signs out. */
export async function revokeSession(sessionRecordId: string): Promise<void> {
  try {
    await prisma.loginSession.updateMany({
      // updateMany, not update: a missing or already-revoked row is not an error worth
      // failing a sign-out over.
      where: { id: sessionRecordId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  } catch (error) {
    console.error("Failed to revoke session", sessionRecordId, error)
  }
}

/**
 * Ends every active sign-in for a user, on every device.
 *
 * Called when an account is deactivated — the case that matters, because a dismissed staff
 * member's laptop is exactly what needs cutting off. Returns how many were ended so the
 * caller can say so.
 */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  try {
    const result = await prisma.loginSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return result.count
  } catch (error) {
    console.error("Failed to revoke sessions for user", userId, error)
    return 0
  }
}

/** Active sign-ins for a user, newest first — what an admin needs to see to act. */
export async function listActiveSessions(userId: string) {
  return prisma.loginSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      issuedAt: true,
      lastActivity: true,
      expiresAt: true,
    },
  })
}
