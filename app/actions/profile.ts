"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"

export async function updateProfile(data: {
  userId: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}) {
  try {
    const session = await auth()
    
    // Verify user can only update their own profile
    if (!session?.user || session.user.id !== data.userId) {
      throw new Error("Unauthorized")
    }

    const updatedUser = await prisma.user.update({
      where: { id: data.userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    })

    revalidatePath("/dashboard/profile")
    revalidatePath("/dashboard")

    return updatedUser
  } catch (error) {
    console.error("Failed to update profile:", error)
    throw new Error("Failed to update profile")
  }
}
// Change user password
export async function changePassword({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: string
  currentPassword: string
  newPassword: string
}) {
  // Verify the current user is authorized to change this password
  const session = await auth()

  if (!session?.user || (session.user.id !== userId && session.user.role !== "SUPER_ADMIN")) {
    throw new Error("Unauthorized")
  }

  // Get the user's primary credential
  const primaryCredential = await prisma.credential.findFirst({
    where: {
      userId,
      isPrimary: true,
    },
  })

  if (!primaryCredential) {
    throw new Error("No primary credential found")
  }

  // Verify the current password
  const isPasswordValid = await bcrypt.compare(currentPassword, primaryCredential.passwordHash)

  if (!isPasswordValid) {
    throw new Error("Current password is incorrect")
  }

  // Hash the new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10)

  // Update all credentials with the new password
  await prisma.credential.updateMany({
    where: { userId },
    data: {
      passwordHash: newPasswordHash,
    },
  })

  return { success: true }
}

// Update contact information
export async function updateContactInfo({
  userId,
  email,
  phone,
  registrationNumber,
  emailCredentialId,
  phoneCredentialId,
  regNumberCredentialId,
}: {
  userId: string
  email?: string
  phone?: string
  registrationNumber?: string
  emailCredentialId?: string
  phoneCredentialId?: string
  regNumberCredentialId?: string
}) {
  // Verify the current user is authorized to update this contact info
  const session = await auth()

  if (!session?.user || (session.user.id !== userId && session.user.role !== "SUPER_ADMIN")) {
    throw new Error("Unauthorized")
  }

  // Update email credential if it exists and has changed
  if (email && emailCredentialId) {
    await prisma.credential.update({
      where: { id: emailCredentialId },
      data: { value: email },
    })
  } else if (email) {
    // Create new email credential if it doesn't exist
    await prisma.credential.create({
      data: {
        userId,
        type: "EMAIL",
        value: email,
        passwordHash: "", // This would need to be set properly in a real implementation
        isPrimary: false,
      },
    })
  }

  // Update phone credential if it exists and has changed
  if (phone && phoneCredentialId) {
    await prisma.credential.update({
      where: { id: phoneCredentialId },
      data: { value: phone },
    })
  } else if (phone) {
    // Create new phone credential if it doesn't exist
    await prisma.credential.create({
      data: {
        userId,
        type: "PHONE",
        value: phone,
        passwordHash: "", // This would need to be set properly in a real implementation
        isPrimary: false,
      },
    })
  }

  // Update registration number credential if it exists and has changed
  if (registrationNumber && regNumberCredentialId) {
    await prisma.credential.update({
      where: { id: regNumberCredentialId },
      data: { value: registrationNumber },
    })
  } else if (registrationNumber) {
    // Create new registration number credential if it doesn't exist
    await prisma.credential.create({
      data: {
        userId,
        type: "REGISTRATION_NUMBER",
        value: registrationNumber,
        passwordHash: "", // This would need to be set properly in a real implementation
        isPrimary: false,
      },
    })
  }

  revalidatePath("/dashboard/profile")
  return { success: true }
}

