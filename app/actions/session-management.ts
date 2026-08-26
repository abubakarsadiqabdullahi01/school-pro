"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function getWritableSessionSchoolId(userId: string, role: string, requestedSchoolId: string) {
  if (role === "SUPER_ADMIN") {
    return requestedSchoolId
  }

  if (role !== "ADMIN") {
    return null
  }

  const admin = await prisma.admin.findUnique({
    where: { userId },
    select: { schoolId: true },
  })

  if (!admin?.schoolId || admin.schoolId !== requestedSchoolId) {
    return null
  }

  return admin.schoolId
}

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
    if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Unauthorized" }
    }

    const schoolId = await getWritableSessionSchoolId(session.user.id, session.user.role, data.schoolId)

    if (!schoolId) {
      return { success: false, error: "Unauthorized for this school" }
    }

    // Check if session name already exists for this school
    const existingSession = await prisma.session.findFirst({
      where: {
        name: data.name,
        schoolId,
      },
    })

    if (existingSession) {
      return { success: false, error: "Session name already exists for this school" }
    }

    // If setting as current, deactivate other current sessions for this school
    if (data.isCurrent) {
      await prisma.session.updateMany({
        where: {
          schoolId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      })
    }

    const newSession = await prisma.session.create({
      data: {
        name: data.name,
        schoolId,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      },
    })

    revalidatePath("/dashboard/super-admin/sessions")
    revalidatePath("/dashboard/admin/school-sessions")
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
    if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Unauthorized" }
    }

    const schoolId = await getWritableSessionSchoolId(session.user.id, session.user.role, data.schoolId)

    if (!schoolId) {
      return { success: false, error: "Unauthorized for this school" }
    }

    const targetSession = await prisma.session.findFirst({
      where: {
        id: data.id,
        schoolId,
      },
      select: { id: true },
    })

    if (!targetSession) {
      return { success: false, error: "Session not found for this school" }
    }

    // Check if session name already exists for another session in this school
    const existingSession = await prisma.session.findFirst({
      where: {
        name: data.name,
        schoolId,
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
          schoolId,
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
    revalidatePath("/dashboard/admin/school-sessions")
    revalidatePath(`/dashboard/admin/school-sessions/${data.id}`)
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
    if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Unauthorized" }
    }

    const adminSchoolId =
      session.user.role === "ADMIN"
        ? (
            await prisma.admin.findUnique({
              where: { userId: session.user.id },
              select: { schoolId: true },
            })
          )?.schoolId
        : undefined

    if (session.user.role === "ADMIN" && !adminSchoolId) {
      return { success: false, error: "Admin not associated with a school" }
    }

    const sessionWithTerms = await prisma.session.findFirst({
      where: {
        id,
        ...(adminSchoolId ? { schoolId: adminSchoolId } : {}),
      },
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
    revalidatePath("/dashboard/admin/school-sessions")
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
    if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Unauthorized" }
    }

    let authorizedSchoolId = schoolId

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      if (!admin?.schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }

      if (admin.schoolId !== schoolId) {
        return { success: false, error: "Unauthorized for this school" }
      }

      authorizedSchoolId = admin.schoolId
    }

    const targetSession = await prisma.session.findFirst({
      where: {
        id: sessionId,
        schoolId: authorizedSchoolId,
      },
      select: { id: true },
    })

    if (!targetSession) {
      return { success: false, error: "Session not found for this school" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate all current sessions for this school
      await tx.session.updateMany({
        where: {
          schoolId: authorizedSchoolId,
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
    revalidatePath("/dashboard/admin/school-sessions")
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
    if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Unauthorized" }
    }

    const adminSchoolId =
      session.user.role === "ADMIN"
        ? (
            await prisma.admin.findUnique({
              where: { userId: session.user.id },
              select: { schoolId: true },
            })
          )?.schoolId
        : undefined

    if (session.user.role === "ADMIN" && !adminSchoolId) {
      return { success: false, error: "Admin not associated with a school" }
    }

    const sessionData = await prisma.session.findFirst({
      where: {
        id,
        ...(adminSchoolId ? { schoolId: adminSchoolId } : {}),
      },
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
