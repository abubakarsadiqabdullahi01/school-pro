import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"
import { CredentialType } from "@prisma/client"

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
          if (!credentials?.identifier || !credentials?.password) {
            console.log("Missing credentials")
            return null
          }

          console.log("Attempting login with identifier:", credentials.identifier)

          // Find credential by any of the possible types
          const credential = await prisma.credential.findFirst({
            where: {
              value: credentials.identifier,
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
            console.log("No credential found for:", credentials.identifier)
            // Log failed attempt
            await logLoginAttempt({
              credentialId: null,
              userId: null,
              ipAddress: "127.0.0.1", // In production, get from request
              status: "FAILED_CREDENTIAL",
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
              ipAddress: "127.0.0.1", // In production, get from request
              status: "FAILED_CREDENTIAL",
            })
            return null
          }

          // Verify password
          const isValidPassword = await bcrypt.compare(credentials.password, credential.passwordHash)

          if (!isValidPassword) {
            console.log("Invalid password for user:", credential.userId)
            // Log failed attempt
            await logLoginAttempt({
              credentialId: credential.id,
              userId: credential.userId,
              ipAddress: "127.0.0.1", // In production, get from request
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
            ipAddress: "127.0.0.1", // In production, get from request
            status: "SUCCESS",
          })

          // Create session record
          await createLoginSession({
            userId: credential.userId,
            credentialId: credential.id,
            ipAddress: "127.0.0.1", // In production, get from request
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
        metadata,
      },
    })
  } catch (error) {
    console.error("Failed to log login attempt:", error)
    return null
  }
}

// Helper function to create login session
async function createLoginSession({ userId, credentialId, ipAddress, userAgent = null, deviceId = null }) {
  try {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days from now

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

