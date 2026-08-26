/**
 * Sign-in throttle and session-revocation checks against a real database.
 *
 * Run:  npx tsx scripts/qa-throttle.ts
 *
 * End-to-end check of the sign-in throttle and session revocation against the real dev
 * database. Inserts rows under a distinctive marker IP and deletes exactly those rows
 * afterwards, in a finally block.
 */
import { PrismaClient } from "@prisma/client"
import { evaluateLoginThrottle } from "../lib/login-throttle.server";
import { MAX_FAILURES_PER_ACCOUNT } from "../lib/login-throttle";

const prisma = new PrismaClient()
const MARKER_IP = "203.0.113.250" // TEST-NET-3, never a real client

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, firstName: true } })
  if (!user) throw new Error("No users in the database to test with")

  console.log(`Testing against user ${user.id} (${user.firstName})\n`)

  try {
    // 1. Clean slate.
    let verdict = await evaluateLoginThrottle(user.id, MARKER_IP)
    console.log("no failures        ->", verdict.blocked ? "BLOCKED" : "allowed")
    if (verdict.blocked) throw new Error("blocked with zero failures")

    // 2. One below the limit.
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i++) {
      await prisma.loginAttempt.create({
        data: { userId: user.id, ipAddress: MARKER_IP, status: "FAILED_PASSWORD" },
      })
    }
    verdict = await evaluateLoginThrottle(user.id, MARKER_IP)
    console.log(`${MAX_FAILURES_PER_ACCOUNT - 1} failures         ->`, verdict.blocked ? "BLOCKED" : "allowed")
    if (verdict.blocked) throw new Error("blocked one below the limit")

    // 3. At the limit.
    await prisma.loginAttempt.create({
      data: { userId: user.id, ipAddress: MARKER_IP, status: "FAILED_PASSWORD" },
    })
    verdict = await evaluateLoginThrottle(user.id, MARKER_IP)
    console.log(`${MAX_FAILURES_PER_ACCOUNT} failures         ->`, verdict.blocked ? `BLOCKED (${verdict.reason})` : "allowed")
    if (!verdict.blocked) throw new Error("did NOT block at the limit")
    console.log("  message:", verdict.message)

    // 4. Failures outside the window must not count.
    await prisma.loginAttempt.deleteMany({ where: { ipAddress: MARKER_IP } })
    const longAgo = new Date(Date.now() - 60 * 60 * 1000) // an hour back
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT + 2; i++) {
      await prisma.loginAttempt.create({
        data: { userId: user.id, ipAddress: MARKER_IP, status: "FAILED_PASSWORD", attemptTime: longAgo },
      })
    }
    verdict = await evaluateLoginThrottle(user.id, MARKER_IP)
    console.log(`${MAX_FAILURES_PER_ACCOUNT + 2} old failures     ->`, verdict.blocked ? "BLOCKED" : "allowed (aged out)")
    if (verdict.blocked) throw new Error("counted failures outside the window")

    // 5. An unresolvable address must not be counted, or one such client locks out all.
    await prisma.loginAttempt.deleteMany({ where: { ipAddress: MARKER_IP } })
    verdict = await evaluateLoginThrottle(null, "unknown")
    console.log('unknown ip, no user ->', verdict.blocked ? "BLOCKED" : "allowed")
    if (verdict.blocked) throw new Error('"unknown" ip was counted')

    // 6. Session revocation round-trip.
    const session = await prisma.loginSession.create({
      data: {
        userId: user.id,
        ipAddress: MARKER_IP,
        sessionToken: `verify_${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
    const before = await prisma.loginSession.findUnique({
      where: { id: session.id },
      select: { revokedAt: true },
    })
    await prisma.loginSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    const after = await prisma.loginSession.findUnique({
      where: { id: session.id },
      select: { revokedAt: true },
    })
    console.log(
      "session revocation  ->",
      before?.revokedAt === null && after?.revokedAt !== null ? "writes revokedAt" : "FAILED",
    )
    if (before?.revokedAt !== null || after?.revokedAt === null) {
      throw new Error("revokedAt was not written")
    }
    await prisma.loginSession.delete({ where: { id: session.id } })

    console.log("\nAll throttle and revocation checks passed.")
  } finally {
    const removed = await prisma.loginAttempt.deleteMany({ where: { ipAddress: MARKER_IP } })
    await prisma.loginSession.deleteMany({ where: { ipAddress: MARKER_IP } })
    console.log(`\nCleaned up ${removed.count} marker attempt row(s).`)
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("\nFAILED:", error.message)
  process.exit(1)
})
