"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"
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
  const actor = await requirePermission("academics.manage")

  try {
    // If admin, verify they are creating a class for their assigned school
    assertSchoolAccess(actor, schoolId)

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
  const actor = await requirePermission("academics.manage")

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
    assertSchoolAccess(actor, classToUpdate.schoolId)

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
  const actor = await requirePermission("academics.manage")

  try {
    // Check if class exists
    const classToDelete = await prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        classTerms: { select: { id: true } },
        subjects: { select: { id: true } },
      },
    })

    // Fees now hang off ClassTerm rather than Class, so they are counted through it.
    const feeStructureCount = await prisma.feeStructure.count({
      where: { classTerm: { classId: id } },
    })

    if (!classToDelete) {
      throw new Error("Class not found")
    }

    // If admin, verify they are deleting a class for their assigned school
    assertSchoolAccess(actor, classToDelete.schoolId)

    // A class sits at the top of a cascade that ends at student results:
    //   Class -> ClassTerm -> StudentClassTerm -> Assessment, every link CASCADE.
    // Deleting one also cascades StudentEnrollmentHistory and StudentTransition (both
    // ends), so an unguarded delete took enrolment history, promotion history and every
    // score any student earned in the class. There was no guard at all.
    const enrolmentCount = await prisma.studentClassTerm.count({
      where: { classTerm: { classId: id } },
    })

    if (enrolmentCount > 0) {
      const assessmentCount = await prisma.assessment.count({
        where: { studentClassTerm: { classTerm: { classId: id } } },
      })

      throw new Error(
        assessmentCount > 0
          ? `Cannot delete this class: ${enrolmentCount} student enrolment(s) and ${assessmentCount} recorded result(s) belong to it. Move the students to another class first.`
          : `Cannot delete this class: ${enrolmentCount} student enrolment(s) belong to it. Move the students to another class first.`,
      )
    }

    // Delete all related data. Fees go first: they hang off ClassTerm, so deleting the
    // class terms would cascade them away and leave this deleteMany matching nothing.
    if (feeStructureCount > 0) {
      await prisma.feeStructure.deleteMany({
        where: { classTerm: { classId: id } },
      })
    }

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

    // Delete the class
    await prisma.class.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/classes")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete class:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to delete class")
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
  const actor = await requirePermission("academics.manage")

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
    assertSchoolAccess(actor, classData.schoolId)

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
    throw new Error(error instanceof Error ? error.message : "Failed to assign subjects")
  }
}
