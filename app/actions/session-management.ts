"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Create a new session
export async function createSession(data: {
  name: string
  schoolId: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
}) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if session name already exists for this school
    const existingSession = await prisma.session.findFirst({
      where: {
        name: data.name,
        schoolId: data.schoolId,
      },
    })

    if (existingSession) {
      return { success: false, error: "Session name already exists for this school" }
    }

    // If setting as current, deactivate other current sessions for this school
    if (data.isCurrent) {
      await prisma.session.updateMany({
        where: {
          schoolId: data.schoolId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      })
    }

    const newSession = await prisma.session.create({
      data: {
        name: data.name,
        schoolId: data.schoolId,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    return { success: true, data: newSession, message: "Session created successfully" }
  } catch (error) {
    console.error("Error creating session:", error)
    return { success: false, error: "Failed to create session" }
  }
}

// Update session
export async function updateSession(data: {
  id: string
  name: string
  schoolId: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
}) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if session name already exists for another session in this school
    const existingSession = await prisma.session.findFirst({
      where: {
        name: data.name,
        schoolId: data.schoolId,
        id: { not: data.id },
      },
    })

    if (existingSession) {
      return { success: false, error: "Session name already exists for this school" }
    }

    // If setting as current, deactivate other current sessions for this school
    if (data.isCurrent) {
      await prisma.session.updateMany({
        where: {
          schoolId: data.schoolId,
          isCurrent: true,
          id: { not: data.id },
        },
        data: { isCurrent: false },
      })
    }

    const updatedSession = await prisma.session.update({
      where: { id: data.id },
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    return { success: true, data: updatedSession, message: "Session updated successfully" }
  } catch (error) {
    console.error("Error updating session:", error)
    return { success: false, error: "Failed to update session" }
  }
}

// Delete session
export async function deleteSession(id: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if session has terms
    const sessionWithTerms = await prisma.session.findUnique({
      where: { id },
      include: {
        _count: {
          select: { terms: true },
        },
      },
    })

    if (!sessionWithTerms) {
      return { success: false, error: "Session not found" }
    }

    if (sessionWithTerms.isCurrent) {
      return { success: false, error: "Cannot delete current session" }
    }

    if (sessionWithTerms._count.terms > 0) {
      return { success: false, error: "Cannot delete session with existing terms" }
    }

    await prisma.session.delete({
      where: { id },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    return { success: true, message: "Session deleted successfully" }
  } catch (error) {
    console.error("Error deleting session:", error)
    return { success: false, error: "Failed to delete session" }
  }
}

// Set current session
export async function setCurrentSession(sessionId: string, schoolId: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate all current sessions for this school
      await tx.session.updateMany({
        where: {
          schoolId: schoolId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      })

      // Set the selected session as current
      await tx.session.update({
        where: { id: sessionId },
        data: { isCurrent: true },
      })
    })

    revalidatePath("/dashboard/super-admin/sessions")
    return { success: true, message: "Current session updated successfully" }
  } catch (error) {
    console.error("Error setting current session:", error)
    return { success: false, error: "Failed to update current session" }
  }
}

// Get session details
export async function getSession(id: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const sessionData = await prisma.session.findUnique({
      where: { id },
      include: {
        school: {
          select: {
            name: true,
            code: true,
          },
        },
        terms: {
          orderBy: { startDate: "asc" },
        },
        _count: {
          select: {
            terms: true,
          },
        },
      },
    })

    if (!sessionData) {
      return { success: false, error: "Session not found" }
    }

    return { success: true, data: sessionData }
  } catch (error) {
    console.error("Error fetching session:", error)
    return { success: false, error: "Failed to fetch session details" }
  }
}

// Get all sessions with formatting
export async function getSessions() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const sessions = await prisma.session.findMany({
      include: {
        school: {
          select: {
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            terms: true,
          },
        },
      },
      orderBy: [{ isCurrent: "desc" }, { school: { name: "asc" } }, { startDate: "desc" }],
    })

    const formattedSessions = sessions.map((session) => ({
      id: session.id,
      name: session.name,
      school: session.school.name,
      schoolCode: session.school.code,
      schoolId: session.schoolId,
      startDate: session.startDate,
      endDate: session.endDate,
      isCurrent: session.isCurrent,
      termsCount: session._count.terms,
      studentsCount: 0, // This would need to be calculated based on your needs
      createdAt: session.createdAt,
    }))

    return { success: true, data: formattedSessions }
  } catch (error) {
    console.error("Error fetching sessions:", error)
    return { success: false, error: "Failed to fetch sessions" }
  }
}

// Get schools for session creation
export async function getSchoolsForSession() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const schools = await prisma.school.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: "asc" },
    })

    return { success: true, data: schools }
  } catch (error) {
    console.error("Error fetching schools:", error)
    return { success: false, error: "Failed to fetch schools" }
  }
}
