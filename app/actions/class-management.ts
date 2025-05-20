"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import type { ClassLevel } from "@prisma/client"

// Create a new class
export async function createClass({
  name,
  level,
  schoolId,
}: {
  name: string
  level: ClassLevel
  schoolId: string
}) {
  // Verify the current user is authorized to create classes
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // If admin, verify they are creating a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== schoolId) {
        throw new Error("You can only create classes for your assigned school")
      }
    }

    // Create the class
    const newClass = await prisma.class.create({
      data: {
        name,
        level,
        schoolId,
      },
    })

    revalidatePath("/dashboard/admin/classes")
    return { success: true, classId: newClass.id }
  } catch (error) {
    console.error("Failed to create class:", error)
    throw new Error("Failed to create class")
  }
}

// Update an existing class
export async function updateClass({
  id,
  name,
  level,
}: {
  id: string
  name: string
  level: ClassLevel
}) {
  // Verify the current user is authorized to update classes
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the class to update
    const classToUpdate = await prisma.class.findUnique({
      where: { id },
      select: { id: true, schoolId: true },
    })

    if (!classToUpdate) {
      throw new Error("Class not found")
    }

    // If admin, verify they are updating a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== classToUpdate.schoolId) {
        throw new Error("You can only update classes for your assigned school")
      }
    }

    // Update the class
    await prisma.class.update({
      where: { id },
      data: {
        name,
        level,
      },
    })

    revalidatePath("/dashboard/admin/classes")
    revalidatePath(`/dashboard/admin/classes/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Failed to update class:", error)
    throw new Error("Failed to update class")
  }
}

// Delete a class
export async function deleteClass(id: string) {
  // Verify the current user is authorized to delete classes
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Check if class exists
    const classToDelete = await prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        classTerms: { select: { id: true } },
        subjects: { select: { id: true } },
        feeStructures: { select: { id: true } },
      },
    })

    if (!classToDelete) {
      throw new Error("Class not found")
    }

    // If admin, verify they are deleting a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== classToDelete.schoolId) {
        throw new Error("You can only delete classes for your assigned school")
      }
    }

    // Delete all related data
    if (classToDelete.classTerms.length > 0) {
      await prisma.classTerm.deleteMany({
        where: { classId: id },
      })
    }

    if (classToDelete.subjects.length > 0) {
      await prisma.classSubject.deleteMany({
        where: { classId: id },
      })
    }

    if (classToDelete.feeStructures.length > 0) {
      await prisma.feeStructure.deleteMany({
        where: { classId: id },
      })
    }

    // Delete the class
    await prisma.class.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/classes")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete class:", error)
    throw new Error("Failed to delete class")
  }
}

// Assign subjects to a class
export async function assignSubjectsToClass({
  classId,
  subjectIds,
}: {
  classId: string
  subjectIds: string[]
}) {
  // Verify the current user is authorized to assign subjects
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the class
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
        subjects: {
          select: {
            subjectId: true,
          },
        },
      },
    })

    if (!classData) {
      throw new Error("Class not found")
    }

    // If admin, verify they are managing a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== classData.schoolId) {
        throw new Error("You can only manage classes for your assigned school")
      }
    }

    // Get the current term for this school
    const currentTerm = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        session: {
          school: {
            id: classData.schoolId,
          },
        },
      },
      select: {
        id: true,
      },
    })

    if (!currentTerm) {
      throw new Error("No current term found for this school")
    }

    // Find or create a ClassTerm for this class and the current term
    let classTerm = await prisma.classTerm.findUnique({
      where: {
        classId_termId: {
          classId: classId,
          termId: currentTerm.id,
        },
      },
    })

    if (!classTerm) {
      classTerm = await prisma.classTerm.create({
        data: {
          class: {
            connect: { id: classId },
          },
          term: {
            connect: { id: currentTerm.id },
          },
        },
      })
    }

    // Get currently assigned subject IDs
    const currentSubjectIds = classData.subjects.map((s) => s.subjectId)

    // Find subjects to remove (in current but not in new list)
    const subjectsToRemove = currentSubjectIds.filter((id) => !subjectIds.includes(id))

    // Find subjects to add (in new list but not in current)
    const subjectsToAdd = subjectIds.filter((id) => !currentSubjectIds.includes(id))

    // Start a transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Remove subjects that are no longer assigned
      if (subjectsToRemove.length > 0) {
        await tx.classSubject.deleteMany({
          where: {
            classId,
            subjectId: { in: subjectsToRemove },
            classTermId: classTerm.id,
          },
        })
      }

      // Add newly assigned subjects
      for (const subjectId of subjectsToAdd) {
        await tx.classSubject.create({
          data: {
            class: {
              connect: { id: classId },
            },
            subject: {
              connect: { id: subjectId },
            },
            classTerm: {
              connect: { id: classTerm.id },
            },
          },
        })
      }
    })

    revalidatePath(`/dashboard/admin/classes/${classId}`)
    revalidatePath(`/dashboard/admin/classes/${classId}/subjects/assign`)
    return { success: true }
  } catch (error) {
    console.error("Failed to assign subjects:", error)
    throw new Error(error.message || "Failed to assign subjects")
  }
}
