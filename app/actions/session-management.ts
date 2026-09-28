"use server"

import { assertSchoolAccess, authActive, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

function getWritableSessionSchoolId(actor: Actor, requestedSchoolId: string) {
  try {
    assertSchoolAccess(actor, requestedSchoolId)
    return requestedSchoolId
  } catch {
    return null
  }
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
    const actor = await requirePermission("academics.manage")
    if (!(data.startDate instanceof Date) || !(data.endDate instanceof Date) || data.startDate > data.endDate) {
      return { success: false, error: "Session start date must be on or before its end date" }
    }

    // Sessions are the spine every other record hangs off: terms, class terms, fee
    // schedules, charges, results and promotions are all filed under one. A school admin
    // opening a second session by mistake splits a year's data in two, and nothing in the
    // app makes that obvious afterwards. So the calendar is opened at platform level and
    // the school works inside it.
    if (actor.role !== "SUPER_ADMIN") {
      return {
        success: false,
        error:
          "Only a super admin can create an academic session. Ask them to open the session, " +
          "then you can add its terms.",
      }
    }
    if (data.isCurrent) {
      return {
        success: false,
        error: "Create at least one term first, then make the session current by selecting its current term.",
      }
    }

    const schoolId = getWritableSessionSchoolId(actor, data.schoolId)

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

    const newSession = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.session.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } })
        await tx.term.updateMany({
          where: { session: { schoolId }, isCurrent: true },
          data: { isCurrent: false },
        })
      }
      return tx.session.create({
        data: {
          name: data.name,
          schoolId,
          startDate: data.startDate,
          endDate: data.endDate,
          isCurrent: data.isCurrent,
        },
      })
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
    const actor = await requirePermission("academics.manage")
    if (!(data.startDate instanceof Date) || !(data.endDate instanceof Date) || data.startDate > data.endDate) {
      return { success: false, error: "Session start date must be on or before its end date" }
    }
    const schoolId = getWritableSessionSchoolId(actor, data.schoolId)

    if (!schoolId) {
      return { success: false, error: "Unauthorized for this school" }
    }

    const targetSession = await prisma.session.findFirst({
      where: {
        id: data.id,
        schoolId,
      },
      select: {
        id: true,
        isCurrent: true,
        terms: { select: { id: true, isCurrent: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } },
      },
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

    const now = new Date()
    const pointerTerm = data.isCurrent
      ? targetSession.terms.find((term) => term.isCurrent) ??
        targetSession.terms.find((term) => term.startDate <= now && term.endDate >= now) ??
        targetSession.terms[0]
      : null
    if (data.isCurrent && !pointerTerm) {
      return { success: false, error: "A session must contain a term before it can become current" }
    }
    if (targetSession.isCurrent && !data.isCurrent) {
      return { success: false, error: "Select another current term instead of clearing the current session" }
    }

    const updatedSession = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.session.updateMany({
          where: { schoolId, isCurrent: true, id: { not: data.id } },
          data: { isCurrent: false },
        })
        await tx.term.updateMany({
          where: { session: { schoolId, id: { not: data.id } }, isCurrent: true },
          data: { isCurrent: false },
        })
        await tx.term.updateMany({
          where: { sessionId: data.id, isCurrent: true, id: { not: pointerTerm!.id } },
          data: { isCurrent: false },
        })
        await tx.term.update({ where: { id: pointerTerm!.id }, data: { isCurrent: true } })
        await tx.schoolAcademicPeriod.upsert({
          where: { schoolId },
          create: { schoolId, sessionId: data.id, termId: pointerTerm!.id, updatedBy: actor.userId },
          update: { sessionId: data.id, termId: pointerTerm!.id, updatedBy: actor.userId },
        })
      }
      return tx.session.update({
        where: { id: data.id },
        data: {
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          isCurrent: data.isCurrent,
        },
      })
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
    const actor = await requirePermission("academics.manage")

    const sessionWithTerms = await prisma.session.findFirst({
      where: {
        id,
        ...(actor.schoolId ? { schoolId: actor.schoolId } : {}),
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
    const actor = await requirePermission("academics.manage")
    const authorizedSchoolId = getWritableSessionSchoolId(actor, schoolId)
    if (!authorizedSchoolId) {
      return { success: false, error: "Unauthorized for this school" }
    }

    const targetSession = await prisma.session.findFirst({
      where: {
        id: sessionId,
        schoolId: authorizedSchoolId,
      },
      select: {
        id: true,
        terms: { select: { id: true, isCurrent: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } },
      },
    })

    if (!targetSession) {
      return { success: false, error: "Session not found for this school" }
    }

    const now = new Date()
    const targetTerm =
      targetSession.terms.find((term) => term.isCurrent) ??
      targetSession.terms.find((term) => term.startDate <= now && term.endDate >= now) ??
      targetSession.terms[0]
    if (!targetTerm) {
      return { success: false, error: "A session must contain a term before it can become current" }
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
      await tx.term.updateMany({
        where: { session: { schoolId: authorizedSchoolId }, isCurrent: true },
        data: { isCurrent: false },
      })
      await tx.term.update({ where: { id: targetTerm.id }, data: { isCurrent: true } })
      await tx.schoolAcademicPeriod.upsert({
        where: { schoolId: authorizedSchoolId },
        create: { schoolId: authorizedSchoolId, sessionId, termId: targetTerm.id, updatedBy: actor.userId },
        update: { sessionId, termId: targetTerm.id, updatedBy: actor.userId },
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
    const actor = await requirePermission("academics.manage")

    const sessionData = await prisma.session.findFirst({
      where: {
        id,
        ...(actor.schoolId ? { schoolId: actor.schoolId } : {}),
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
    const session = await authActive()
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
    const session = await authActive()
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
