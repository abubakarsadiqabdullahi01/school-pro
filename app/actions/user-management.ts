"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { CredentialType, Role } from "@prisma/client"

// Create a new admin user
export async function createAdmin({
  firstName,
  lastName,
  email,
  password,
  phone,
  dateOfBirth,
  avatarUrl,
  schoolId,
  permissions,
  isActive,
}: {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  dateOfBirth?: Date
  avatarUrl?: string
  schoolId: string
  permissions: string
  isActive: boolean
}) {
  // Verify the current user is authorized to create admins
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized")
  }

  // Check if email is already in use
  const existingCredential = await prisma.credential.findFirst({
    where: {
      type: "EMAIL",
      value: email,
    },
  })

  if (existingCredential) {
    throw new Error("Email is already in use")
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(password, 10)

  try {
    // Create the user and admin in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          firstName,
          lastName,
          role: Role.ADMIN,
          phone,
          dateOfBirth,
          avatarUrl,
          isActive,
        },
      })

      // Create the admin
      await tx.admin.create({
        data: {
          userId: user.id,
          schoolId,
          permissions,
        },
      })

      // Create the email credential
      await tx.credential.create({
        data: {
          userId: user.id,
          type: CredentialType.EMAIL,
          value: email,
          passwordHash,
          isPrimary: true,
        },
      })

      // Create phone credential if provided
      if (phone) {
        await tx.credential.create({
          data: {
            userId: user.id,
            type: CredentialType.PHONE,
            value: phone,
            passwordHash,
            isPrimary: false,
          },
        })
      }

      return user
    })

    revalidatePath("/dashboard/super-admin/users/admins")
    return { success: true, userId: result.id }
  } catch (error) {
    console.error("Failed to create admin:", error)
    throw new Error("Failed to create administrator")
  }
}

// Create a new school
export async function createSchool({
  name,
  code,
  address,
  phone,
  email,
  website,
  logoUrl,
  isActive,
}: {
  name: string
  code: string
  address: string
  phone: string
  email: string
  website?: string
  logoUrl?: string
  isActive: boolean
}) {
  // Verify the current user is authorized to create schools
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized")
  }

  // Check if school code is already in use
  const existingSchool = await prisma.school.findUnique({
    where: {
      code,
    },
  })

  if (existingSchool) {
    throw new Error("School code is already in use")
  }

  try {
    // Create the school
    const school = await prisma.school.create({
      data: {
        name,
        code,
        address,
        phone,
        email,
        website,
        logoUrl,
        isActive,
      },
    })

    revalidatePath("/dashboard/super-admin/schools")
    return { success: true, schoolId: school.id }
  } catch (error) {
    console.error("Failed to create school:", error)
    throw new Error("Failed to create school")
  }
}

// Update a school
export async function updateSchool({
  id,
  name,
  code,
  address,
  phone,
  email,
  website,
  logoUrl,
  isActive,
}: {
  id: string
  name: string
  code: string
  address: string
  phone: string
  email: string
  website?: string
  logoUrl?: string
  isActive: boolean
}) {
  // Verify the current user is authorized to update schools
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized")
  }

  // Check if school exists
  const existingSchool = await prisma.school.findUnique({
    where: {
      id,
    },
  })

  if (!existingSchool) {
    throw new Error("School not found")
  }

  // Check if code is already in use by another school
  const codeInUse = await prisma.school.findFirst({
    where: {
      code,
      id: {
        not: id,
      },
    },
  })

  if (codeInUse) {
    throw new Error("School code is already in use")
  }

  try {
    // Update the school
    await prisma.school.update({
      where: {
        id,
      },
      data: {
        name,
        code,
        address,
        phone,
        email,
        website,
        logoUrl,
        isActive,
      },
    })

    revalidatePath("/dashboard/super-admin/schools")
    revalidatePath(`/dashboard/super-admin/schools/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Failed to update school:", error)
    throw new Error("Failed to update school")
  }
}

// Delete a school
export async function deleteSchool(id: string) {
  // Verify the current user is authorized to delete schools
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized")
  }

  // Check if school exists
  const existingSchool = await prisma.school.findUnique({
    where: {
      id,
    },
    include: {
      _count: {
        select: {
          students: true,
          teachers: true,
          admins: true,
        },
      },
    },
  })

  if (!existingSchool) {
    throw new Error("School not found")
  }

  // Check if school has associated users
  const totalAssociatedUsers =
    existingSchool._count.students + existingSchool._count.teachers + existingSchool._count.admins

  if (totalAssociatedUsers > 0) {
    throw new Error("Cannot delete school with associated users")
  }

  try {
    // Delete the school
    await prisma.school.delete({
      where: {
        id,
      },
    })

    revalidatePath("/dashboard/super-admin/schools")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete school:", error)
    throw new Error("Failed to delete school")
  }
}

