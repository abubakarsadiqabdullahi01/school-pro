"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireActor } from "@/lib/authz"
import { recordAudit } from "@/lib/audit"

const profileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  avatarUrl: z.string().trim().url().nullable().optional(),
})

const passwordSchema = z.object({
  userId: z.string().uuid(),
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
})

const optionalEmail = z.union([z.literal(""), z.string().trim().email()]).optional()
const optionalPhone = z.union([z.literal(""), z.string().trim().min(7).max(30)]).optional()
const optionalRegistration = z.union([z.literal(""), z.string().trim().min(2).max(80)]).optional()

const contactSchema = z.object({
  userId: z.string().uuid(),
  email: optionalEmail,
  phone: optionalPhone,
  registrationNumber: optionalRegistration,
  // Accepted for compatibility with older clients, but deliberately never trusted.
  emailCredentialId: z.string().optional(),
  phoneCredentialId: z.string().optional(),
  regNumberCredentialId: z.string().optional(),
})

async function requireSelf(userId: string) {
  const actor = await requireActor()
  if (actor.userId !== userId) throw new Error("You can only change your own profile")
  return actor
}

export async function updateProfile(input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input)
  const actor = await requireSelf(data.userId)
  const before = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { firstName: true, lastName: true, avatarUrl: true },
  })
  if (!before) throw new Error("User profile not found")

  const updatedUser = await prisma.user.update({
    where: { id: data.userId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      avatarUrl: data.avatarUrl || null,
    },
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  })

  await recordAudit({
    actor,
    action: "profile.update",
    entityType: "User",
    entityId: data.userId,
    summary: "Updated personal profile information",
    before,
    after: updatedUser,
  })
  revalidatePath("/dashboard/profile")
  revalidatePath("/dashboard")
  return updatedUser
}

export async function changePassword(input: z.input<typeof passwordSchema>) {
  const data = passwordSchema.parse(input)
  const actor = await requireSelf(data.userId)
  const primaryCredential = await prisma.credential.findFirst({
    where: { userId: data.userId, isPrimary: true },
    select: { passwordHash: true },
  })
  if (!primaryCredential) throw new Error("No primary credential found")

  const isPasswordValid = await bcrypt.compare(data.currentPassword, primaryCredential.passwordHash)
  if (!isPasswordValid) throw new Error("Current password is incorrect")
  if (await bcrypt.compare(data.newPassword, primaryCredential.passwordHash)) {
    throw new Error("The new password must be different from the current password")
  }

  const newPasswordHash = await bcrypt.hash(data.newPassword, 12)
  await prisma.$transaction([
    prisma.credential.updateMany({
      where: { userId: data.userId },
      data: { passwordHash: newPasswordHash },
    }),
    // Password changes invalidate every existing JWT-backed login immediately.
    prisma.loginSession.updateMany({
      where: { userId: data.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  await recordAudit({
    actor,
    action: "profile.password_change",
    entityType: "User",
    entityId: data.userId,
    summary: "Changed password and signed out existing sessions",
  })
  return { success: true }
}

export async function updateContactInfo(input: z.input<typeof contactSchema>) {
  const data = contactSchema.parse(input)
  const actor = await requireSelf(data.userId)

  await prisma.$transaction(async (tx) => {
    const [user, primaryCredential] = await Promise.all([
      tx.user.findUnique({
        where: { id: data.userId },
        select: { student: { select: { id: true } } },
      }),
      tx.credential.findFirst({
        where: { userId: data.userId, isPrimary: true },
        select: { passwordHash: true },
      }),
    ])
    if (!user) throw new Error("User profile not found")
    if (!primaryCredential?.passwordHash) throw new Error("No valid primary credential found")

    const saveCredential = async (
      type: "EMAIL" | "PHONE" | "REGISTRATION_NUMBER",
      value: string | undefined,
    ) => {
      if (!value) return
      await tx.credential.upsert({
        where: { userId_type: { userId: data.userId, type } },
        create: {
          userId: data.userId,
          type,
          value,
          passwordHash: primaryCredential.passwordHash,
          isPrimary: false,
        },
        update: { value },
      })
    }

    await saveCredential("EMAIL", data.email)
    await saveCredential("PHONE", data.phone)
    // The registration number is not the student's to change. It is the school's record of
    // them - on every receipt, report card and dedicated-account payment - and the login it
    // backs is issued by the school. Self-service let a student rewrite their own admission
    // number; a change now comes from the school's student record instead.
    if (data.phone) {
      await tx.user.update({ where: { id: data.userId }, data: { phone: data.phone } })
    }
  })

  await recordAudit({
    actor,
    action: "profile.contact_update",
    entityType: "User",
    entityId: data.userId,
    summary: "Updated contact and login information",
  })
  revalidatePath("/dashboard/profile")
  return { success: true }
}
