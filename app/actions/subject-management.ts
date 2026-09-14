"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"

// Create a new subject
export async function createSubject({
  name,
  code,
  schoolId,
}: {
  name: string
  code: string
  schoolId: string
}) {
  // Verify the current user is authorized to create subjects
  const actor = await requirePermission("academics.manage")

  try {
    // If admin, verify they are creating a subject for their assigned school
    assertSchoolAccess(actor, schoolId)

    // Check if subject code already exists for this school
    const existingSubject = await prisma.subject.findFirst({
      where: {
        schoolId,
        code,
      },
    })

    if (existingSubject) {
      throw new Error("A subject with this code already exists in this school")
    }

    // Create the subject
    const newSubject = await prisma.subject.create({
      data: {
        name,
        code,
        schoolId,
      },
    })

    revalidatePath("/dashboard/admin/subjects")
    return { success: true, subjectId: newSubject.id }
  } catch (error) {
    console.error("Failed to create subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to create subject")
    }
    throw new Error("Failed to create subject")
  }
}

// Update an existing subject
export async function updateSubject({
  id,
  name,
  code,
}: {
  id: string
  name: string
  code: string
}) {
  // Verify the current user is authorized to update subjects
  const actor = await requirePermission("academics.manage")

  try {
    // Get the subject to update
    const subjectToUpdate = await prisma.subject.findUnique({
      where: { id },
      select: { id: true, schoolId: true, code: true },
    })

    if (!subjectToUpdate) {
      throw new Error("Subject not found")
    }

    // If admin, verify they are updating a subject for their assigned school
    assertSchoolAccess(actor, subjectToUpdate.schoolId)

    // Check if the code is being changed and if it already exists
    if (code !== subjectToUpdate.code) {
      const existingSubject = await prisma.subject.findFirst({
        where: {
          schoolId: subjectToUpdate.schoolId,
          code,
          id: { not: id },
        },
      })

      if (existingSubject) {
        throw new Error("A subject with this code already exists in this school")
      }
    }

    // Update the subject
    await prisma.subject.update({
      where: { id },
      data: {
        name,
        code,
      },
    })

    revalidatePath("/dashboard/admin/subjects")
    revalidatePath(`/dashboard/admin/subjects/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Failed to update subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to update subject")
    }
    throw new Error("Failed to update subject")
  }
}

// Delete a subject
export async function deleteSubject(id: string) {
  // Verify the current user is authorized to delete subjects
  const actor = await requirePermission("academics.manage")

  try {
    // Check if subject exists
    const subjectToDelete = await prisma.subject.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        classSubjects: { select: { id: true } },
        teacherSubjects: { select: { id: true } },
      },
    })

    if (!subjectToDelete) {
      throw new Error("Subject not found")
    }

    // If admin, verify they are deleting a subject for their assigned school
    assertSchoolAccess(actor, subjectToDelete.schoolId)

    // Check if subject is in use
    if (subjectToDelete.classSubjects.length > 0) {
      throw new Error("Cannot delete subject as it is assigned to one or more classes")
    }

    // `classSubjects` is the *current* timetable and says nothing about marks already
    // recorded. A subject dropped from the curriculum has no class assignment and still
    // holds every score ever entered against it — and assessments.subjectId is CASCADE.
    const assessmentCount = await prisma.assessment.count({ where: { subjectId: id } })

    if (assessmentCount > 0) {
      throw new Error(
        `Cannot delete this subject: ${assessmentCount} recorded result(s) belong to it.`,
      )
    }

    // Delete all related data
    if (subjectToDelete.teacherSubjects.length > 0) {
      await prisma.teacherSubject.deleteMany({
        where: { subjectId: id },
      })
    }

    // Delete the subject
    await prisma.subject.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/subjects")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to delete subject")
    }
    throw new Error("Failed to delete subject")
  }
}

// Assign teachers to a subject
export async function assignTeachersToSubject({
  subjectId,
  teacherIds,
}: {
  subjectId: string
  teacherIds: string[]
}) {
  // Verify the current user is authorized to assign teachers
  const actor = await requirePermission("academics.manage")

  try {
    // Get the subject
    const subjectData = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        schoolId: true,
        teacherSubjects: {
          select: {
            teacherId: true,
          },
        },
      },
    })

    if (!subjectData) {
      throw new Error("Subject not found")
    }

    // If admin, verify they are managing a subject for their assigned school
    assertSchoolAccess(actor, subjectData.schoolId)

    // Get currently assigned teacher IDs
    const currentTeacherIds = subjectData.teacherSubjects.map((ts) => ts.teacherId)

    const currentTerm = await prisma.term.findFirst({
      where: {
        session: {
          schoolId: subjectData.schoolId,
          isCurrent: true,
        },
        isCurrent: true,
      },
      select: { id: true },
    })

    if (!currentTerm) {
      throw new Error("No current term found for this school")
    }

    // Find teachers to remove (in current but not in new list)
    const teachersToRemove = currentTeacherIds.filter((id) => !teacherIds.includes(id))

    // Find teachers to add (in new list but not in current)
    const teachersToAdd = teacherIds.filter((id) => !currentTeacherIds.includes(id))

    // Start a transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Remove teachers that are no longer assigned
      if (teachersToRemove.length > 0) {
        await tx.teacherSubject.deleteMany({
          where: {
            subjectId,
            teacherId: { in: teachersToRemove },
          },
        })
      }

      // Add newly assigned teachers
      for (const teacherId of teachersToAdd) {
        // Verify teacher belongs to the same school as the subject
        const teacher = await tx.teacher.findUnique({
          where: { id: teacherId },
          select: { schoolId: true },
        })

        if (!teacher || teacher.schoolId !== subjectData.schoolId) {
          throw new Error("Teacher does not belong to the same school as the subject")
        }

        await tx.teacherSubject.create({
          data: {
            subjectId,
            teacherId,
            termId: currentTerm.id,
          },
        })
      }
    })

    revalidatePath(`/dashboard/admin/subjects/${subjectId}`)
    revalidatePath(`/dashboard/admin/subjects/${subjectId}/assign-teachers`)
    return { success: true }
  } catch (error) {
    console.error("Failed to assign teachers:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to assign teachers")
    }
    throw new Error("Failed to assign teachers")
  }
}
