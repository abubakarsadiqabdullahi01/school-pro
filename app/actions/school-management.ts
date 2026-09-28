"use server"

import { authActive } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { SYSTEM_PERMISSION_PROFILES } from "@/lib/permissions"

// Create a new school
export async function createSchool(data: {
  name: string
  code: string
  address: string
  phone: string
  email: string
  website?: string
  logoUrl?: string
  admissionPrefix?: string
  admissionFormat?: string
  admissionSequenceStart?: number
}) {
  try {
    const session = await authActive()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if school code already exists
    const existingSchool = await prisma.school.findUnique({
      where: { code: data.code }
    })

    if (existingSchool) {
      return { success: false, error: "School code already exists" }
    }

    const normalizedSchoolName = data.name.trim().toLowerCase()
    const existingName = await prisma.school.findFirst({
      where: { name: data.name.trim() },
      select: { id: true },
    })

    if (existingName || normalizedSchoolName.length === 0) {
      return { success: false, error: "School name already exists" }
    }

    // Check if email already exists
    const existingEmail = await prisma.school.findFirst({
      where: { email: data.email }
    })

    if (existingEmail) {
      return { success: false, error: "School email already exists" }
    }

    const school = await prisma.$transaction(async (tx) => {
      const created = await tx.school.create({
        data: {
          name: data.name.trim(),
          code: data.code.trim().toUpperCase(),
          address: data.address.trim(),
          phone: data.phone.trim(),
          email: data.email.trim().toLowerCase(),
          website: data.website?.trim() || null,
          logoUrl: data.logoUrl?.trim() || null,
          admissionPrefix: data.admissionPrefix?.trim().toUpperCase() || "STD",
          admissionFormat: data.admissionFormat?.trim() || "{PREFIX}-{YEAR}-{NUMBER}",
          admissionSequenceStart: Math.max(1, Math.trunc(data.admissionSequenceStart ?? 1)),
          isActive: true,
        },
      })

      await tx.gradingSystem.create({
        data: {
          schoolId: created.id,
          name: "WAEC Standard",
          description: "West African Examination Council Standard Grading",
          isDefault: true,
          passMark: 40,
          levels: {
            create: [
              { minScore: 75, maxScore: 100, grade: "A1", remark: "Excellent" },
              { minScore: 70, maxScore: 74, grade: "B2", remark: "Very Good" },
              { minScore: 65, maxScore: 69, grade: "B3", remark: "Good" },
              { minScore: 60, maxScore: 64, grade: "C4", remark: "Credit" },
              { minScore: 55, maxScore: 59, grade: "C5", remark: "Credit" },
              { minScore: 50, maxScore: 54, grade: "C6", remark: "Credit" },
              { minScore: 45, maxScore: 49, grade: "D7", remark: "Pass" },
              { minScore: 40, maxScore: 44, grade: "E8", remark: "Pass" },
              { minScore: 0, maxScore: 39, grade: "F9", remark: "Fail" },
            ],
          },
        },
      })
      await tx.assessmentScheme.create({
        data: { schoolId: created.id, name: "Three CAs and an exam", ca1Max: 10, ca2Max: 10, ca3Max: 10, examMax: 70 },
      })
      await tx.transitionPolicy.create({ data: { schoolId: created.id } })
      await Promise.all(
        Object.entries(SYSTEM_PERMISSION_PROFILES).map(([code, profile]) =>
          tx.permissionProfile.create({
            data: {
              schoolId: created.id,
              code,
              name: profile.name,
              description: `System profile: ${profile.name}`,
              permissions: profile.permissions,
              isSystem: true,
            },
          }),
        ),
      )
      return created
    })

    revalidatePath("/dashboard/super-admin/schools")
    return { success: true, data: school }
  } catch (error) {
    console.error("Error creating school:", error)
    return { success: false, error: "Failed to create school" }
  }
}

// Update school
export async function updateSchool(id: string, data: {
  name: string
  code: string
  address: string
  phone: string
  email: string
  website?: string
  logoUrl?: string
  admissionPrefix?: string
  admissionFormat?: string
  admissionSequenceStart?: number
}) {
  try {
    const session = await authActive()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if school exists
    const existingSchool = await prisma.school.findUnique({
      where: { id }
    })

    if (!existingSchool) {
      return { success: false, error: "School not found" }
    }

    // Check if code is being changed and if it already exists
    if (data.code !== existingSchool.code) {
      const codeExists = await prisma.school.findUnique({
        where: { code: data.code }
      })
      if (codeExists) {
        return { success: false, error: "School code already exists" }
      }
    }

    if (data.name !== existingSchool.name) {
      const nameExists = await prisma.school.findFirst({
        where: {
          id: { not: id },
          name: data.name.trim(),
        },
        select: { id: true },
      })
      if (nameExists) {
        return { success: false, error: "School name already exists" }
      }
    }

    // Check if email is being changed and if it already exists
    if (data.email !== existingSchool.email) {
      const emailExists = await prisma.school.findFirst({
        where: { email: data.email }
      })
      if (emailExists) {
        return { success: false, error: "School email already exists" }
      }
    }

    const school = await prisma.school.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        address: data.address,
        phone: data.phone,
        email: data.email,
        website: data.website,
        logoUrl: data.logoUrl,
        admissionPrefix: data.admissionPrefix || "STD",
        admissionFormat: data.admissionFormat || "{PREFIX}-{YEAR}-{NUMBER}",
        admissionSequenceStart: data.admissionSequenceStart || 1,
      }
    })

    revalidatePath("/dashboard/super-admin/schools")
    revalidatePath(`/dashboard/super-admin/schools/${id}`)
    return { success: true, data: school }
  } catch (error) {
    console.error("Error updating school:", error)
    return { success: false, error: "Failed to update school" }
  }
}

// Toggle school status
export async function toggleSchoolStatus(id: string) {
  try {
    const session = await authActive()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const school = await prisma.school.findUnique({
      where: { id }
    })

    if (!school) {
      return { success: false, error: "School not found" }
    }

    const updatedSchool = await prisma.$transaction(async (tx) => {
      const updated = await tx.school.update({
        where: { id },
        data: { isActive: !school.isActive },
      })
      if (!updated.isActive) {
        const members = await tx.user.findMany({
          where: {
            OR: [
              { admin: { schoolId: id } },
              { teacher: { schoolId: id } },
              { parent: { schoolId: id } },
              { student: { schoolId: id } },
              { staffRecord: { schoolId: id } },
            ],
          },
          select: { id: true },
        })
        await tx.loginSession.updateMany({
          where: { userId: { in: members.map((member) => member.id) }, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }
      return updated
    })

    revalidatePath("/dashboard/super-admin/schools")
    revalidatePath(`/dashboard/super-admin/schools/${id}`)
    
    return { 
      success: true, 
      data: { 
        isActive: updatedSchool.isActive,
        message: updatedSchool.isActive ? "School activated successfully" : "School deactivated successfully"
      }
    }
  } catch (error) {
    console.error("Error toggling school status:", error)
    return { success: false, error: "Failed to update school status" }
  }
}

// Get school details
export async function getSchool(id: string) {
  try {
    const session = await authActive()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const school = await prisma.school.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
            admins: true,
            sessions: true,
            classes: true,
            subjects: true,
          }
        },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            terms: {
              select: { id: true }
            }
          }
        },
        admins: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                credentials: {
                  where: { type: "EMAIL" },
                  select: { value: true }
                }
              }
            }
          }
        }
      }
    })

    if (!school) {
      return { success: false, error: "School not found" }
    }

    return { success: true, data: school }
  } catch (error) {
    console.error("Error fetching school:", error)
    return { success: false, error: "Failed to fetch school details" }
  }
}

// Delete school (soft delete by deactivating)
export async function deleteSchool(id: string) {
  try {
    const session = await authActive()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if school has active students or teachers
    const school = await prisma.school.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: true,
            teachers: true,
          }
        }
      }
    })

    if (!school) {
      return { success: false, error: "School not found" }
    }

    if (school._count.students > 0 || school._count.teachers > 0) {
      return { 
        success: false, 
        error: "Cannot delete school with active students or teachers. Please deactivate instead." 
      }
    }

    // Soft delete by deactivating
    await prisma.school.update({
      where: { id },
      data: { isActive: false }
    })

    revalidatePath("/dashboard/super-admin/schools")
    return { success: true, message: "School deactivated successfully" }
  } catch (error) {
    console.error("Error deleting school:", error)
    return { success: false, error: "Failed to delete school" }
  }
}
