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
    await prisma.classTerm.delete({
      where: { id: classTermId },
    })

    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to remove class from term:", error)
    throw new Error(error.message || "Failed to remove class from term")
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

      // Add newly assigned subjects
      for (const subjectId of subjectsToAdd) {
        // Verify subject belongs to the same school as the class
        const subject = await tx.subject.findUnique({
          where: { id: subjectId },
          select: { schoolId: true },
        })

        if (!subject || subject.schoolId !== classTerm.class.schoolId) {
          throw new Error("Subject does not belong to the same school as the class")
        }

        await tx.classSubject.create({
          data: {
            classTermId,
            classId: classTerm.class.id,
            subjectId,
          },
        })
      }
    })

    revalidatePath(`/dashboard/admin/class-terms/${classTermId}/subjects`)
    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to assign subjects to class term:", error)
    throw new Error(error.message || "Failed to assign subjects to class term")
  }
}
