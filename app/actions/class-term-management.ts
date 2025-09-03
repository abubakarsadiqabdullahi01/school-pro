"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"

// Assign a class to a term
export async function assignClassToTerm({
  classId,
  termId,
}: {
  classId: string
  termId: string
}) {
  // Verify the current user is authorized
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the class
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, schoolId: true },
    })

    if (!classData) {
      throw new Error("Class not found")
    }

    // Get the term
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: {
        session: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!term) {
      throw new Error("Term not found")
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

      // Verify the term belongs to the same school
      if (term.session.schoolId !== admin.schoolId) {
        throw new Error("The term does not belong to your school")
      }
    }

    // Check if the class is already assigned to this term
    const existingClassTerm = await prisma.classTerm.findFirst({
      where: {
        classId,
        termId,
      },
    })

    if (existingClassTerm) {
      return { success: true, classTermId: existingClassTerm.id }
    }

    // Create the class term
    const classTerm = await prisma.classTerm.create({
      data: {
        classId,
        termId,
      },
    })

    revalidatePath("/dashboard/admin/class-terms")
    return { success: true, classTermId: classTerm.id }
  } catch (error) {
    console.error("Failed to assign class to term:", error)
    throw new Error(error.message || "Failed to assign class to term")
  }
}

// Remove a class from a term
export async function removeClassFromTerm(classTermId: string) {
  // Verify the current user is authorized
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    // If admin, verify they are managing a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== classTerm.class.schoolId) {
        throw new Error("You can only manage classes for your assigned school")
      }
    }

    // Check if there are any class subjects
    const classSubjects = await prisma.classSubject.findMany({
      where: {
        classTermId,
      },
    })

    // Delete all class subjects first
    if (classSubjects.length > 0) {
      await prisma.classSubject.deleteMany({
        where: {
          classTermId,
        },
      })
    }

    // Delete the class term
    // Ensure there are no students still enrolled in this class term
    const enrolledStudentsCount = await prisma.studentClassTerm.count({
      where: { classTermId },
    })

    if (enrolledStudentsCount > 0) {
      throw new Error(
        "Cannot remove class from term: there are students enrolled in this class term. Remove or reassign students before deleting the class term",
      )
    }

    await prisma.classTerm.delete({
      where: { id: classTermId },
    })

    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to remove class from term:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || "Failed to remove class from term")
  }
}

// Assign subjects to a class term
export async function assignSubjectsToClassTerm({
  classTermId,
  subjectIds,
}: {
  classTermId: string
  subjectIds: string[]
}) {
  // Verify the current user is authorized
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            id: true,
            schoolId: true,
          },
        },
        classSubjects: {
          select: {
            subjectId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    // If admin, verify they are managing a class for their assigned school
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin || admin.schoolId !== classTerm.class.schoolId) {
        throw new Error("You can only manage classes for your assigned school")
      }
    }

    // Get currently assigned subject IDs
    const currentSubjectIds = classTerm.classSubjects.map((cs) => cs.subjectId)

    // Find subjects to remove (in current but not in new list)
    const subjectsToRemove = currentSubjectIds.filter((id) => !subjectIds.includes(id))

    // Find subjects to add (in new list but not in current)
    const subjectsToAdd = subjectIds.filter((id) => !currentSubjectIds.includes(id))

    // Validate subjects to add outside the transaction to avoid long-running transactions
    if (subjectsToAdd.length > 0) {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectsToAdd } },
        select: { id: true, schoolId: true },
      })

      // Ensure all requested subjects exist
      const foundIds = new Set(subjects.map((s) => s.id))
      for (const sid of subjectsToAdd) {
        if (!foundIds.has(sid)) {
          throw new Error(`Subject not found: ${sid}`)
        }
      }

      // Ensure all subjects belong to the same school as the class
      for (const s of subjects) {
        if (s.schoolId !== classTerm.class.schoolId) {
          throw new Error("Subject does not belong to the same school as the class")
        }
      }
    }

    // Start a transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Remove subjects that are no longer assigned
      if (subjectsToRemove.length > 0) {
        await tx.classSubject.deleteMany({
          where: {
            classTermId,
            subjectId: { in: subjectsToRemove },
          },
        })
      }

      // Add newly assigned subjects using createMany to minimize per-item queries
      if (subjectsToAdd.length > 0) {
        const createData = subjectsToAdd.map((subjectId) => ({
          classTermId,
          classId: classTerm.class.id,
          subjectId,
        }))

        // Use createMany for bulk insert; skipDuplicates in case of race conditions
        await tx.classSubject.createMany({ data: createData, skipDuplicates: true })
      }
    })

    revalidatePath(`/dashboard/admin/class-terms/${classTermId}/subjects`)
    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to assign subjects to class term:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || "Failed to assign subjects to class term")
  }
}
