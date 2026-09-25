import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"
import { CredentialType, Prisma, type AttemptStatus } from "@prisma/client"
import { evaluateLoginThrottle } from "@/lib/login-throttle.server"

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email/ID/Phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        try {
          if (
            typeof credentials?.identifier !== "string" ||
            typeof credentials?.password !== "string" ||
            !credentials.identifier ||
            !credentials.password
          ) {
            console.log("Missing credentials")
            return null
          }

          const identifier = credentials.identifier
          const password = credentials.password
          const ipAddress = getClientIp(req)
          const userAgent = getUserAgent(req)

          console.log("Attempting login with identifier:", identifier)

          // Find credential by any of the possible types
          const credential = await prisma.credential.findFirst({
            where: {
              value: identifier,
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  isActive: true,
                  role: true,
                  avatarUrl: true,
                },
              },
            },
          })


          if (!credential) {
            console.log("No credential found for:", identifier)
            // Log failed attempt
            await logLoginAttempt({
              credentialId: null,
              userId: null,
              ipAddress,
              userAgent,
              status: "FAILED_CREDENTIAL",
            })
            return null
          }

          // Brute-force check. Enforced here rather than only in the login server action,
          // because the NextAuth credentials callback is reachable directly and a control
          // that can be bypassed by posting to an API route is not a control.
          const throttle = await evaluateLoginThrottle(credential.userId, ipAddress)
          if (throttle.blocked) {
            console.warn("Sign-in throttled:", { userId: credential.userId, reason: throttle.reason })
            await logLoginAttempt({
              credentialId: credential.id,
              userId: credential.userId,
              ipAddress,
              userAgent,
              status: "LOCKED_OUT",
              metadata: { reason: throttle.reason },
            })
            return null
          }

          console.log("Found credential type:", credential.type, "for user:", credential.userId)

          // Check if user is active
          if (!credential.user.isActive) {
            console.log("User is inactive:", credential.userId)
            await logLoginAttempt({
              credentialId: credential.id,
              userId: credential.userId,
              ipAddress,
              userAgent,
              status: "FAILED_CREDENTIAL",
            })
            return null
          }

          // Verify password
          const isValidPassword = await bcrypt.compare(password, credential.passwordHash)

          if (!isValidPassword) {
            console.log("Invalid password for user:", credential.userId)
            // Log failed attempt
            await logLoginAttempt({
              credentialId: credential.id,
              userId: credential.userId,
              ipAddress,
              userAgent,
              status: "FAILED_PASSWORD",
            })
            return null
          }

          console.log("Login successful for user:", credential.userId)

          // Update last used timestamp
          await prisma.credential.update({
            where: { id: credential.id },
            data: { lastUsedAt: new Date() },
          })

          // Log successful attempt
          await logLoginAttempt({
            credentialId: credential.id,
            userId: credential.userId,
            ipAddress,
            userAgent,
            status: "SUCCESS",
          })

          // Create session record. Its id travels in the JWT so a specific sign-in can be
          // revoked later — without it, `revokedAt` had nothing to point at.
          const loginSession = await createLoginSession({
            userId: credential.userId,
            credentialId: credential.id,
            ipAddress,
            userAgent,
          })

          // Return the user object with all required fields
          return {
            id: credential.user.id,
            name: `${credential.user.firstName} ${credential.user.lastName}`,
            email: credential.type === CredentialType.EMAIL ? credential.value : `${credential.userId}@schoolpro.local`,
            image: credential.user.avatarUrl,
            firstName: credential.user.firstName,
            lastName: credential.user.lastName,
            role: credential.user.role,
            isActive: credential.user.isActive,
            avatarUrl: credential.user.avatarUrl,
            sessionRecordId: loginSession?.id ?? null,
          }
        } catch (error) {
          console.error("Error in authorize callback:", error)
          return null
        }
      },
    }),
  ],
  debug: process.env.NODE_ENV === "development",
})

// Helper function to log login attempts
async function logLoginAttempt({
  credentialId,
  userId,
  ipAddress,
  status,
  userAgent = null,
  deviceFingerprint = null,
  metadata = null,
}: {
  credentialId?: string | null
  userId?: string | null
  ipAddress: string
  status: AttemptStatus
  userAgent?: string | null
  deviceFingerprint?: string | null
  metadata?: Prisma.InputJsonValue | null
}) {
  try {
    if (!userId && credentialId) {
      const credential = await prisma.credential.findUnique({
        where: { id: credentialId },
        select: { userId: true },
      })
      userId = credential?.userId
    }

    if (!userId) return null

    return await prisma.loginAttempt.create({
      data: {
        credentialId,
        userId,
        ipAddress,
        userAgent,
        deviceFingerprint,
        status,
        metadata: metadata ?? Prisma.JsonNull,
      },
    })
  } catch (error) {
    console.error("Failed to log login attempt:", error)
    return null
  }
}

/**
 * The configured maximum session length in days, or 30 if nothing is set.
 *
 * Reads the platform row directly rather than through `lib/session-activity.server.ts`:
 * that module is cached per school, and at this point in the sign-in there is no school
 * resolved yet. The per-school value is applied on every subsequent request.
 */
async function configuredSessionDays(): Promise<number> {
  try {
    const row = await prisma.systemConfiguration.findFirst({
      where: { schoolId: null, configKey: "defaultSessionDurationDays", isActive: true },
      select: { configValue: true },
    })
    const parsed = Number(row?.configValue)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 30
  } catch (error) {
    console.error("Failed to read the configured session length; using 30 days", error)
    return 30
  }
}

// Helper function to create login session
async function createLoginSession({
  userId,
  credentialId,
  ipAddress,
  userAgent = null,
  deviceId = null,
}: {
  userId: string
  credentialId?: string | null
  ipAddress: string
  userAgent?: string | null
  deviceId?: string | null
}) {
  try {
    // `defaultSessionDurationDays` has existed as a platform setting since settings were
    // introduced and was read by nothing — the real number was this hardcoded 30. Reading
    // it here is what makes that screen mean something.
    //
    // Falling back rather than failing: a sign-in must not be refused because a settings
    // row could not be read, and `evaluateSessionFreshness` applies the configured ceiling
    // on every request anyway, so a stale `expiresAt` cannot extend anybody's session.
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (await configuredSessionDays()))

    return await prisma.loginSession.create({
      data: {
        userId,
        credentialId,
        ipAddress,
        userAgent,
        deviceId,
        sessionToken: `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        expiresAt,
        sessionData: {},
      },
    })
  } catch (error) {
    console.error("Failed to create login session:", error)
    return null
  }
}

// Resolve the real client IP. Behind cPanel/Cloudflare the socket address is the
// proxy, so trust the forwarding headers first and fall back to "unknown" rather
// than recording a placeholder that looks like a real address.
function getClientIp(req: Request | undefined): string {
  const headers = req?.headers
  if (!headers) return "unknown"

  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    // Comma-separated proxy chain; the original client is the first entry.
    const client = forwardedFor.split(",")[0]?.trim()
    if (client) return client
  }

  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "unknown"
}

function getUserAgent(req: Request | undefined): string | null {
  return req?.headers?.get("user-agent") ?? null
}
