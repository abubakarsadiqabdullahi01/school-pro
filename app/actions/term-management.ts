"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"

// Create a new term
export async function createTerm({
  name,
  sessionId,
  startDate,
  endDate,
  isCurrent,
}: {
  name: string
  sessionId: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
}) {
  // Verify the current user is authorized to create terms
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the session to ensure it exists and to get the schoolId
    const academicSession = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    })

    if (!academicSession) {
      throw new Error("Session not found")
    }

    // If this is set as current, we need to update any existing current terms
    if (isCurrent) {
      // Find any current terms for this session and set them to not current
      await prisma.term.updateMany({
        where: {
          sessionId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      })
    }

    // Create the term
    const newTerm = await prisma.term.create({
      data: {
        name,
        sessionId,
        startDate,
        endDate,
        isCurrent,
      },
    })

    if(session.user.role === "SUPER_ADMIN") {
      revalidatePath("/dashboard/super-admin/terms")
      revalidatePath(`/dashboard/super-admin/sessions/${sessionId}`)
    }

    revalidatePath("/dashboard/admin/school-terms") // Admin only
    revalidatePath(`/dashboard/admin/school-terms/${sessionId}`) // Admin only
    revalidatePath("/dashboard/admin/school-terms")
    return { success: true, termId: newTerm.id }
  } catch (error) {
    console.error("Failed to create term:", error)
    throw new Error("Failed to create term")
  }
}

// Update an existing term
export async function updateTerm({
  id,
  name,
  startDate,
  endDate,
  isCurrent,
}: {
  id: string
  name: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
}) {
  // Verify the current user is authorized to update terms
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the term to update
    const termToUpdate = await prisma.term.findUnique({
      where: { id },
      select: { sessionId: true, isCurrent: true },
    })

    if (!termToUpdate) {
      throw new Error("Term not found")
    }

    // If this is being set as current and wasn't before, update other terms
    if (isCurrent && !termToUpdate.isCurrent) {
      // Find any current terms for this session and set them to not current
      await prisma.term.updateMany({
        where: {
          sessionId: termToUpdate.sessionId,
          isCurrent: true,
          id: { not: id },
        },
        data: {
          isCurrent: false,
        },
      })
    }

    // Update the term
    await prisma.term.update({
      where: { id },
      data: {
        name,
        startDate,
        endDate,
        isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/terms")
    revalidatePath(`/dashboard/super-admin/terms/${id}`)
    revalidatePath(`/dashboard/super-admin/sessions/${termToUpdate.sessionId}`)
    revalidatePath("/dashboard/admin/school-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to update term:", error)
    throw new Error("Failed to update term")
  }
}

// Delete a term
export async function deleteTerm(id: string) {
  // Verify the current user is authorized to delete terms
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Check if term exists
    const termToDelete = await prisma.term.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        classTerms: { select: { id: true } },
        assessments: { select: { id: true } },
        feeStructures: { select: { id: true } },
      },
    })

    if (!termToDelete) {
      throw new Error("Term not found")
    }

    // Delete all related data
    if (termToDelete.classTerms.length > 0) {
      await prisma.classTerm.deleteMany({
        where: { termId: id },
      })
    }

    if (termToDelete.assessments.length > 0) {
      await prisma.assessment.deleteMany({
        where: { termId: id },
      })
    }

    if (termToDelete.feeStructures.length > 0) {
      await prisma.feeStructure.deleteMany({
        where: { termId: id },
      })
    }

    // Delete the term
    await prisma.term.delete({
      where: { id },
    })

    revalidatePath("/dashboard/super-admin/terms")
    revalidatePath(`/dashboard/super-admin/sessions/${termToDelete.sessionId}`)
    revalidatePath("/dashboard/admin/school-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete term:", error)
    throw new Error("Failed to delete term")
  }
}

// Set a term as the current term
export async function setCurrentTerm(id: string, sessionId: string) {
  // Verify the current user is authorized to update terms
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Find any current terms for this session and set them to not current
    await prisma.term.updateMany({
      where: {
        sessionId,
        isCurrent: true,
        id: { not: id },
      },
      data: {
        isCurrent: false,
      },
    })

    // Set the selected term as current
    await prisma.term.update({
      where: { id },
      data: {
        isCurrent: true,
      },
    })

    revalidatePath("/dashboard/super-admin/terms")
    revalidatePath(`/dashboard/super-admin/sessions/${sessionId}`)
    revalidatePath("/dashboard/admin/school-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to set current term:", error)
    throw new Error("Failed to set current term")
  }
}
