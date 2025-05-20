"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Assign a teacher to a class term
export async function assignTeacherToClass(data: {
  teacherId: string
  classTermId: string
}) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the admin's school ID if applicable
    let schoolId: string | undefined

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      schoolId = admin?.schoolId ?? undefined

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    })

    if (!teacher) {
      return { success: false, error: "Teacher not found" }
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" }
    }

    // Verify the class term exists and belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: data.classTermId },
      include: {
        class: {
          select: { schoolId: true },
        },
      },
    })

    if (!classTerm) {
      return { success: false, error: "Class term not found" }
    }

    if (session.user.role === "ADMIN" && classTerm.class.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign to this class" }
    }

    // Check if the assignment already exists
    const existingAssignment = await prisma.teacherClassTerm.findUnique({
      where: {
        teacherId_classTermId: {
          teacherId: data.teacherId,
          classTermId: data.classTermId,
        },
      },
    })

    if (!existingAssignment) {
      // Create a new assignment
      await prisma.teacherClassTerm.create({
        data: {
          teacherId: data.teacherId,
          classTermId: data.classTermId,
        },
      })
    }

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error assigning teacher to class:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign teacher to class",
    }
  }
}

// Unassign a teacher from a class term
export async function unassignTeacherFromClass(teacherClassTermId: string) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the assignment details to verify permissions
    const assignment = await prisma.teacherClassTerm.findUnique({
      where: { id: teacherClassTermId },
      include: {
        teacher: {
          select: { schoolId: true },
        },
        classTerm: {
          include: {
            class: {
              select: { schoolId: true },
            },
          },
        },
      },
    })

    if (!assignment) {
      return { success: false, error: "Assignment not found" }
    }

    // Get the admin's school ID if applicable
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin?.schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }

      // Verify the teacher and class belong to the admin's school
      if (assignment.teacher.schoolId !== admin.schoolId || assignment.classTerm.class.schoolId !== admin.schoolId) {
        return { success: false, error: "Unauthorized to unassign this teacher" }
      }
    }

    // Delete the assignment
    await prisma.teacherClassTerm.delete({
      where: { id: teacherClassTermId },
    })

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${assignment.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error unassigning teacher from class:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unassign teacher from class",
    }
  }
}

// Assign multiple classes to a teacher
export async function assignClassesToTeacher(data: {
  teacherId: string
  classTermIds: string[]
}) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the admin's school ID if applicable
    let schoolId: string | undefined

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      schoolId = admin?.schoolId ?? undefined

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    })

    if (!teacher) {
      return { success: false, error: "Teacher not found" }
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" }
    }

    // Get existing assignments for this teacher
    const existingAssignments = await prisma.teacherClassTerm.findMany({
      where: { teacherId: data.teacherId },
    })

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Remove assignments that are not in the new list
      const assignmentsToRemove = existingAssignments.filter(
        (assignment) => !data.classTermIds.includes(assignment.classTermId),
      )

      if (assignmentsToRemove.length > 0) {
        await tx.teacherClassTerm.deleteMany({
          where: {
            id: { in: assignmentsToRemove.map((a) => a.id) },
          },
        })
      }

      // Add new assignments
      for (const classTermId of data.classTermIds) {
        const existingAssignment = existingAssignments.find((a) => a.classTermId === classTermId)

        if (!existingAssignment) {
          // Create new assignment
          await tx.teacherClassTerm.create({
            data: {
              teacherId: data.teacherId,
              classTermId,
            },
          })
        }
      }
    })

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error assigning classes to teacher:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign classes to teacher",
    }
  }
}

// Assign a teacher to a subject
export async function assignTeacherToSubject(data: { teacherId: string; subjectId: string }) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the admin's school ID if applicable
    let schoolId: string | undefined

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      schoolId = admin?.schoolId ?? undefined

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    })

    if (!teacher) {
      return { success: false, error: "Teacher not found" }
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" }
    }

    // Verify the subject exists and belongs to the admin's school
    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { schoolId: true },
    })

    if (!subject) {
      return { success: false, error: "Subject not found" }
    }

    if (session.user.role === "ADMIN" && subject.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign to this subject" }
    }

    // Check if the assignment already exists
    const existingAssignment = await prisma.teacherSubject.findUnique({
      where: {
        teacherId_subjectId: {
          teacherId: data.teacherId,
          subjectId: data.subjectId,
        },
      },
    })

    if (!existingAssignment) {
      // Create a new assignment
      await prisma.teacherSubject.create({
        data: {
          teacherId: data.teacherId,
          subjectId: data.subjectId,
        },
      })
    }

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error assigning teacher to subject:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign teacher to subject",
    }
  }
}

// Unassign a teacher from a subject
export async function unassignTeacherFromSubject(teacherSubjectId: string) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the assignment details to verify permissions
    const assignment = await prisma.teacherSubject.findUnique({
      where: { id: teacherSubjectId },
      include: {
        teacher: {
          select: { schoolId: true },
        },
        subject: {
          select: { schoolId: true },
        },
      },
    })

    if (!assignment) {
      return { success: false, error: "Assignment not found" }
    }

    // Get the admin's school ID if applicable
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin?.schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }

      // Verify the teacher and subject belong to the admin's school
      if (assignment.teacher.schoolId !== admin.schoolId || assignment.subject.schoolId !== admin.schoolId) {
        return { success: false, error: "Unauthorized to unassign this teacher" }
      }
    }

    // Delete the assignment
    await prisma.teacherSubject.delete({
      where: { id: teacherSubjectId },
    })

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${assignment.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error unassigning teacher from subject:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unassign teacher from subject",
    }
  }
}

// Assign multiple subjects to a teacher
export async function assignSubjectsToTeacher(data: { teacherId: string; subjectIds: string[] }) {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the admin's school ID if applicable
    let schoolId: string | undefined

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      schoolId = admin?.schoolId ?? undefined

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    })

    if (!teacher) {
      return { success: false, error: "Teacher not found" }
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" }
    }

    // Get existing assignments for this teacher
    const existingAssignments = await prisma.teacherSubject.findMany({
      where: { teacherId: data.teacherId },
    })

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Remove assignments that are not in the new list
      const assignmentsToRemove = existingAssignments.filter(
        (assignment) => !data.subjectIds.includes(assignment.subjectId),
      )

      if (assignmentsToRemove.length > 0) {
        await tx.teacherSubject.deleteMany({
          where: {
            id: { in: assignmentsToRemove.map((a) => a.id) },
          },
        })
      }

      // Add new assignments
      for (const subjectId of data.subjectIds) {
        const existingAssignment = existingAssignments.find((a) => a.subjectId === subjectId)

        if (!existingAssignment) {
          // Create new assignment
          await tx.teacherSubject.create({
            data: {
              teacherId: data.teacherId,
              subjectId,
            },
          })
        }
      }
    })

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`)

    return { success: true }
  } catch (error) {
    console.error("Error assigning subjects to teacher:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign subjects to teacher",
    }
  }
}
