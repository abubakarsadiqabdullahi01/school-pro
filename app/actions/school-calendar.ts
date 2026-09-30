"use server"

import { prisma } from "@/lib/db"
import { AuthorizationError, assertSchoolAccess, requirePermission } from "@/lib/authz"
import { canChangeSessionDates, canEditTerm } from "@/lib/term-rules"

interface CalendarData {
  sessions: Array<{
    id: string
    name: string
    startDate: Date
    endDate: Date
    isCurrent: boolean
    totalWeeks: number
    completedWeeks: number
    progressPercentage: number
    terms: Array<{
      id: string
      name: string
      startDate: Date
      endDate: Date
      isCurrent: boolean
      weeks: number
      completedWeeks: number
      progressPercentage: number
      status: "upcoming" | "current" | "completed"
    }>
    breaks: Array<{
      name: string
      startDate: Date
      endDate: Date
      weeks: number
      type: "mid-term" | "inter-term" | "holiday"
    }>
    totalBreakWeeks: number
    academicWeeks: number
  }>
  currentSession?: any
  upcomingEvents: Array<{
    id: string
    title: string
    date: Date
    type: "term-start" | "term-end" | "break-start" | "break-end" | "session-start" | "session-end"
    description: string
  }>
}

function calculateWeeks(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.ceil(diffDays / 7)
}

function calculateCompletedWeeks(startDate: Date, endDate: Date): number {
  const now = new Date()
  const actualEndDate = now < endDate ? now : endDate

  if (now < startDate) return 0

  const diffTime = Math.abs(actualEndDate.getTime() - startDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.ceil(diffDays / 7)
}

function calculateBreaks(terms: any[]): Array<{
  name: string
  startDate: Date
  endDate: Date
  weeks: number
  type: "mid-term" | "inter-term" | "holiday"
}> {
  const breaks: any[] = []

  for (let i = 0; i < terms.length - 1; i++) {
    const currentTerm = terms[i]
    const nextTerm = terms[i + 1]

    const breakStart = new Date(currentTerm.endDate)
    breakStart.setDate(breakStart.getDate() + 1)

    const breakEnd = new Date(nextTerm.startDate)
    breakEnd.setDate(breakEnd.getDate() - 1)

    if (breakStart < breakEnd) {
      breaks.push({
        name: `Break between ${currentTerm.name} and ${nextTerm.name}`,
        startDate: breakStart,
        endDate: breakEnd,
        weeks: calculateWeeks(breakStart, breakEnd),
        type: "inter-term" as const,
      })
    }
  }

  return breaks
}

function getTermStatus(term: any): "upcoming" | "current" | "completed" {
  const now = new Date()
  const startDate = new Date(term.startDate)
  const endDate = new Date(term.endDate)

  if (now < startDate) return "upcoming"
  if (now > endDate) return "completed"
  return "current"
}

function generateUpcomingEvents(sessions: any[]): Array<{
  id: string
  title: string
  date: Date
  type: "term-start" | "term-end" | "break-start" | "break-end" | "session-start" | "session-end"
  description: string
}> {
  const events: any[] = []
  const now = new Date()

  sessions.forEach((session) => {
    // Session events
    if (new Date(session.startDate) > now) {
      events.push({
        id: `session-start-${session.id}`,
        title: `${session.name} Begins`,
        date: new Date(session.startDate),
        type: "session-start" as const,
        description: `Academic session ${session.name} starts`,
      })
    }

    if (new Date(session.endDate) > now) {
      events.push({
        id: `session-end-${session.id}`,
        title: `${session.name} Ends`,
        date: new Date(session.endDate),
        type: "session-end" as const,
        description: `Academic session ${session.name} concludes`,
      })
    }

    // Term events
    session.terms.forEach((term: any) => {
      if (new Date(term.startDate) > now) {
        events.push({
          id: `term-start-${term.id}`,
          title: `${term.name} Begins`,
          date: new Date(term.startDate),
          type: "term-start" as const,
          description: `${term.name} of ${session.name} starts`,
        })
      }

      if (new Date(term.endDate) > now) {
        events.push({
          id: `term-end-${term.id}`,
          title: `${term.name} Ends`,
          date: new Date(term.endDate),
          type: "term-end" as const,
          description: `${term.name} of ${session.name} concludes`,
        })
      }
    })
  })

  // Sort by date and return next 10 events
  return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 10)
}

export async function getSchoolCalendarData(): Promise<CalendarData> {
  try {
    const actor = await requirePermission("academics.manage")
    if (!actor.schoolId) {
      throw new Error("School not found")
    }

    const schoolId = actor.schoolId

    // Fetch sessions with terms
    const sessions = await prisma.session.findMany({
      where: { schoolId },
      include: {
        terms: {
          orderBy: { startDate: "asc" },
        },
      },
      orderBy: { startDate: "desc" },
    })

    const processedSessions = sessions.map((session) => {
      const totalWeeks = calculateWeeks(session.startDate, session.endDate)
      const completedWeeks = calculateCompletedWeeks(session.startDate, session.endDate)
      const progressPercentage = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0

      const processedTerms = session.terms.map((term) => {
        const weeks = calculateWeeks(term.startDate, term.endDate)
        const completedWeeks = calculateCompletedWeeks(term.startDate, term.endDate)
        const progressPercentage = weeks > 0 ? Math.round((completedWeeks / weeks) * 100) : 0
        const status = getTermStatus(term)

        return {
          id: term.id,
          name: term.name,
          startDate: term.startDate,
          endDate: term.endDate,
          isCurrent: term.isCurrent,
          weeks,
          completedWeeks,
          progressPercentage,
          status,
        }
      })

      const breaks = calculateBreaks(session.terms)
      const totalBreakWeeks = breaks.reduce((sum, breakPeriod) => sum + breakPeriod.weeks, 0)
      const academicWeeks = totalWeeks - totalBreakWeeks

      return {
        id: session.id,
        name: session.name,
        startDate: session.startDate,
        endDate: session.endDate,
        isCurrent: session.isCurrent,
        totalWeeks,
        completedWeeks,
        progressPercentage,
        terms: processedTerms,
        breaks,
        totalBreakWeeks,
        academicWeeks,
      }
    })

    const currentSession = processedSessions.find((s) => s.isCurrent)
    const upcomingEvents = generateUpcomingEvents(processedSessions)

    return {
      sessions: processedSessions,
      currentSession,
      upcomingEvents,
    }
  } catch (error) {
    console.error("Failed to get school calendar data:", error)
    throw new Error("Failed to load calendar data")
  }
}

export async function updateSessionDates(sessionId: string, startDate: Date, endDate: Date) {
  try {
    // Being logged in was the only check here. Any account — a student's, a parent's —
    // could rewrite the dates of any session in any school, and `isCurrent` is derived
    // from these dates, so it moved the active session for everyone.
    const actor = await requirePermission("academics.manage")

    const existing = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { schoolId: true, endDate: true, isCurrent: true, terms: { select: { name: true, startDate: true, endDate: true } } },
    })

    if (!existing) {
      return { success: false, message: "Session not found" }
    }

    assertSchoolAccess(actor, existing.schoolId)

    // The same rules as the session form: an ended session is history, and the new dates
    // must still hold every term in it.
    const verdict = canChangeSessionDates(existing, { startDate, endDate }, existing.terms, actor.role)
    if (!verdict.allowed) return { success: false, message: verdict.reason }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        startDate,
        endDate,
        updatedAt: new Date(),
      },
    })

    return { success: true, message: "Session dates updated successfully" }
  } catch (error) {
    console.error("Failed to update session dates:", error)
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message }
    }
    return { success: false, message: "Failed to update session dates" }
  }
}

export async function updateTermDates(termId: string, startDate: Date, endDate: Date) {
  try {
    const actor = await requirePermission("academics.manage")

    // A term's school is its session's school; there is no schoolId on Term itself.
    const existing = await prisma.term.findUnique({
      where: { id: termId },
      select: {
        endDate: true,
        isCurrent: true,
        sessionId: true,
        session: { select: { schoolId: true, startDate: true, endDate: true } },
      },
    })

    if (!existing) {
      return { success: false, message: "Term not found" }
    }

    assertSchoolAccess(actor, existing.session.schoolId)

    // The rules the term form already applies. This quick editor on the calendar skipped
    // them, so any admin could move the dates of a term whose results and fees are filed,
    // stretch a term outside its session, or lay it over another term.
    if (!(startDate instanceof Date) || !(endDate instanceof Date) || !(startDate <= endDate)) {
      return { success: false, message: "Term start date must be on or before its end date" }
    }
    // Judged on the stored dates: whether the term is already history is not for the new
    // dates to restate.
    const editVerdict = canEditTerm(existing, actor.role)
    if (!editVerdict.allowed) return { success: false, message: editVerdict.reason }
    if (startDate < existing.session.startDate || endDate > existing.session.endDate) {
      return { success: false, message: "Term dates must be within the session date range" }
    }
    const overlapping = await prisma.term.findFirst({
      where: { sessionId: existing.sessionId, id: { not: termId }, startDate: { lte: endDate }, endDate: { gte: startDate } },
      select: { name: true },
    })
    if (overlapping) return { success: false, message: `Term dates overlap ${overlapping.name}` }

    await prisma.term.update({
      where: { id: termId },
      data: {
        startDate,
        endDate,
        updatedAt: new Date(),
      },
    })

    return { success: true, message: "Term dates updated successfully" }
  } catch (error) {
    console.error("Failed to update term dates:", error)
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message }
    }
    return { success: false, message: "Failed to update term dates" }
  }
}
