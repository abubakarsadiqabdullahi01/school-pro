"use server"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

// Create a new grading system
export async function createGradingSystem({
  schoolId,
  name,
  description,
  passMark,
}: {
  schoolId: string
  name: string
  description?: string
  passMark: number
}) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get admin's school if admin
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Check if there are any existing grading systems for this school
    const existingCount = await prisma.gradingSystem.count({
      where: { schoolId },
    })

    // Create the grading system
    const gradingSystem = await prisma.gradingSystem.create({
      data: {
        schoolId,
        name,
        description,
        passMark,
        isDefault: existingCount === 0, // Make it default if it's the first one
      },
      include: {
        levels: true,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: gradingSystem }
  } catch (error) {
    console.error("Failed to create grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to create grading system" }
  }
}

// Update a grading system
export async function updateGradingSystem({
  id,
  name,
  description,
  passMark,
}: {
  id: string
  name: string
  description?: string
  passMark: number
}) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    // If admin, verify the grading system belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Update the grading system
    const updatedGradingSystem = await prisma.gradingSystem.update({
      where: { id },
      data: {
        name,
        description,
        passMark,
      },
      include: {
        levels: true,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: updatedGradingSystem }
  } catch (error) {
    console.error("Failed to update grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to update grading system" }
  }
}

// Delete a grading system
export async function deleteGradingSystem({ id }: { id: string }) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true, isDefault: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    // If admin, verify the grading system belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Cannot delete the default grading system
    if (gradingSystem.isDefault) {
      throw new Error("Cannot delete the default grading system")
    }

    // Delete all grade levels first
    await prisma.gradeLevel.deleteMany({
      where: { gradingSystemId: id },
    })

    // Delete the grading system
    await prisma.gradingSystem.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete grading system" }
  }
}

// Set a grading system as default
export async function setDefaultGradingSystem({ id, schoolId }: { id: string; schoolId: string }) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    // If admin, verify the grading system belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Reset all grading systems to non-default
    await prisma.gradingSystem.updateMany({
      where: { schoolId },
      data: { isDefault: false },
    })

    // Set the selected grading system as default
    await prisma.gradingSystem.update({
      where: { id },
      data: { isDefault: true },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to set default grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to set default grading system" }
  }
}

// Add a grade level to a grading system
export async function addGradeLevel({
  gradingSystemId,
  minScore,
  maxScore,
  grade,
  remark,
}: {
  gradingSystemId: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
}) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id: gradingSystemId },
      select: { schoolId: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    // If admin, verify the grading system belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Validate score range
    if (minScore < 0 || minScore > 100 || maxScore < 0 || maxScore > 100) {
      throw new Error("Score must be between 0 and 100")
    }

    if (minScore > maxScore) {
      throw new Error("Minimum score cannot be greater than maximum score")
    }

    // Check if grade already exists for this grading system
    const existingGrade = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId,
        grade,
      },
    })

    if (existingGrade) {
      throw new Error(`Grade "${grade}" already exists in this grading system`)
    }

    // Create the grade level
    const gradeLevel = await prisma.gradeLevel.create({
      data: {
        gradingSystemId,
        minScore,
        maxScore,
        grade,
        remark,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: gradeLevel }
  } catch (error) {
    console.error("Failed to add grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to add grade level" }
  }
}

// Update a grade level
export async function updateGradeLevel({
  id,
  minScore,
  maxScore,
  grade,
  remark,
}: {
  id: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
}) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grade level to verify it belongs to the admin's school
    const gradeLevel = await prisma.gradeLevel.findUnique({
      where: { id },
      include: {
        gradingSystem: {
          select: { schoolId: true },
        },
      },
    })

    if (!gradeLevel) {
      throw new Error("Grade level not found")
    }

    // If admin, verify the grade level belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradeLevel.gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Validate score range
    if (minScore < 0 || minScore > 100 || maxScore < 0 || maxScore > 100) {
      throw new Error("Score must be between 0 and 100")
    }

    if (minScore > maxScore) {
      throw new Error("Minimum score cannot be greater than maximum score")
    }

    // Check if grade already exists for this grading system (excluding this grade level)
    const existingGrade = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId: gradeLevel.gradingSystemId,
        grade,
        id: { not: id },
      },
    })

    if (existingGrade) {
      throw new Error(`Grade "${grade}" already exists in this grading system`)
    }

    // Update the grade level
    const updatedGradeLevel = await prisma.gradeLevel.update({
      where: { id },
      data: {
        minScore,
        maxScore,
        grade,
        remark,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: updatedGradeLevel }
  } catch (error) {
    console.error("Failed to update grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to update grade level" }
  }
}

// Delete a grade level
export async function deleteGradeLevel({ id }: { id: string }) {
  try {
    // Verify the current user is authorized
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    // Get the grade level to verify it belongs to the admin's school
    const gradeLevel = await prisma.gradeLevel.findUnique({
      where: { id },
      include: {
        gradingSystem: {
          select: { schoolId: true },
        },
      },
    })

    if (!gradeLevel) {
      throw new Error("Grade level not found")
    }

    // If admin, verify the grade level belongs to their school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== gradeLevel.gradingSystem.schoolId) {
        throw new Error("Admin not assigned to this school")
      }
    }

    // Delete the grade level
    await prisma.gradeLevel.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete grade level" }
  }
}
