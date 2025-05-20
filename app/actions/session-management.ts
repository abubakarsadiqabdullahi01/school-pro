"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"

// Create a new academic session
export async function createSession({
  name,
  schoolId,
  startDate,
  endDate,
  isCurrent,
}: {
  name: string
  schoolId: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
}) {
  // Verify the current user is authorized to create sessions
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // If this is set as current, we need to update any existing current sessions
    if (isCurrent) {
      // Find any current sessions for this school and set them to not current
      await prisma.session.updateMany({
        where: {
          schoolId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      })
    }

    // Create the session
    const newSession = await prisma.session.create({
      data: {
        name,
        schoolId,
        startDate,
        endDate,
        isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    revalidatePath("/dashboard/admin/school-sessions")
    return { success: true, sessionId: newSession.id }
  } catch (error) {
    console.error("Failed to create session:", error)
    throw new Error("Failed to create academic session")
  }
}

// Update an existing academic session
export async function updateSession({
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
  // Verify the current user is authorized to update sessions
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Get the session to update
    const sessionToUpdate = await prisma.session.findUnique({
      where: { id },
      select: { schoolId: true, isCurrent: true },
    })

    if (!sessionToUpdate) {
      throw new Error("Session not found")
    }

    // If this is being set as current and wasn't before, update other sessions
    if (isCurrent && !sessionToUpdate.isCurrent) {
      // Find any current sessions for this school and set them to not current
      await prisma.session.updateMany({
        where: {
          schoolId: sessionToUpdate.schoolId,
          isCurrent: true,
          id: { not: id },
        },
        data: {
          isCurrent: false,
        },
      })
    }

    // Update the session
    await prisma.session.update({
      where: { id },
      data: {
        name,
        startDate,
        endDate,
        isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    revalidatePath(`/dashboard/super-admin/sessions/${id}`)
    revalidatePath("/dashboard/admin/school-sessions")
    return { success: true }
  } catch (error) {
    console.error("Failed to update session:", error)
    throw new Error("Failed to update academic session")
  }
}

// Delete an academic session
export async function deleteSession(id: string) {
  // Verify the current user is authorized to delete sessions
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Check if session exists
    const sessionToDelete = await prisma.session.findUnique({
      where: { id },
      include: {
        terms: {
          select: { id: true },
        },
      },
    })

    if (!sessionToDelete) {
      throw new Error("Session not found")
    }

    // Delete all terms associated with this session
    if (sessionToDelete.terms.length > 0) {
      await prisma.term.deleteMany({
        where: {
          sessionId: id,
        },
      })
    }

    // Delete the session
    await prisma.session.delete({
      where: { id },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    revalidatePath("/dashboard/admin/school-sessions")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete session:", error)
    throw new Error("Failed to delete academic session")
  }
}

// Set a session as the current session
export async function setCurrentSession(id: string, schoolId: string) {
  // Verify the current user is authorized to update sessions
  const session = await auth()

  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }

  try {
    // Find any current sessions for this school and set them to not current
    await prisma.session.updateMany({
      where: {
        schoolId,
        isCurrent: true,
        id: { not: id },
      },
      data: {
        isCurrent: false,
      },
    })

    // Set the selected session as current
    await prisma.session.update({
      where: { id },
      data: {
        isCurrent: true,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    revalidatePath("/dashboard/admin/school-sessions")
    return { success: true }
  } catch (error) {
    console.error("Failed to set current session:", error)
    throw new Error("Failed to set current session")
  }
}
