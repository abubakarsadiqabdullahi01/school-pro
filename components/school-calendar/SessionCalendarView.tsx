"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isWithinInterval } from "date-fns"

interface SessionCalendarViewProps {
  sessions: any[]
  selectedSession: any
  onSessionSelect: (session: any) => void
}

export function SessionCalendarView({ sessions, selectedSession, onSessionSelect }: SessionCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const getEventsForDay = (day: Date) => {
    if (!selectedSession) return []

    const events: any[] = []

    // Check session start/end
    if (format(day, "yyyy-MM-dd") === format(new Date(selectedSession.startDate), "yyyy-MM-dd")) {
      events.push({ type: "session-start", title: "Session Starts", color: "bg-blue-500" })
    }
    if (format(day, "yyyy-MM-dd") === format(new Date(selectedSession.endDate), "yyyy-MM-dd")) {
      events.push({ type: "session-end", title: "Session Ends", color: "bg-blue-500" })
    }

    // Check term events
    selectedSession.terms?.forEach((term: any) => {
      if (format(day, "yyyy-MM-dd") === format(new Date(term.startDate), "yyyy-MM-dd")) {
        events.push({ type: "term-start", title: `${term.name} Starts`, color: "bg-green-500" })
      }
      if (format(day, "yyyy-MM-dd") === format(new Date(term.endDate), "yyyy-MM-dd")) {
        events.push({ type: "term-end", title: `${term.name} Ends`, color: "bg-red-500" })
      }
    })

    // Check if day is in break period
    selectedSession.breaks?.forEach((breakPeriod: any) => {
      if (
        isWithinInterval(day, {
          start: new Date(breakPeriod.startDate),
          end: new Date(breakPeriod.endDate),
        })
      ) {
        events.push({ type: "break", title: "Break", color: "bg-orange-500" })
      }
    })

    return events
  }

  const getDayStatus = (day: Date) => {
    if (!selectedSession) return "inactive"

    const sessionStart = new Date(selectedSession.startDate)
    const sessionEnd = new Date(selectedSession.endDate)

    if (day < sessionStart || day > sessionEnd) return "inactive"

    // Check if in term
    const inTerm = selectedSession.terms?.some((term: any) =>
      isWithinInterval(day, {
        start: new Date(term.startDate),
        end: new Date(term.endDate),
      }),
    )

    if (inTerm) return "term"

    // Check if in break
    const inBreak = selectedSession.breaks?.some((breakPeriod: any) =>
      isWithinInterval(day, {
        start: new Date(breakPeriod.startDate),
        end: new Date(breakPeriod.endDate),
      }),
    )

    if (inBreak) return "break"

    return "inactive"
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev)
      if (direction === "prev") {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  return (
    <div className="space-y-4">
      {/* Session Selector */}
      <Card className="shadow-sm">
        <CardHeader className="p-4">
          <CardTitle className="text-base">Calendar View</CardTitle>
          <CardDescription>View your academic calendar with sessions, terms, and breaks</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Session</label>
              <Select
                value={selectedSession?.id || ""}
                onValueChange={(value) => {
                  const session = sessions.find((s) => s.id === value)
                  if (session) onSessionSelect(session)
                }}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Choose a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      <div className="flex items-center gap-2">
                        <span>{session.name}</span>
                        {session.isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSession && (
              <div className="text-sm text-muted-foreground">
                <div>
                  {format(new Date(selectedSession.startDate), "MMM dd, yyyy")} -{" "}
                  {format(new Date(selectedSession.endDate), "MMM dd, yyyy")}
                </div>
                <div>
                  {selectedSession.totalWeeks} weeks total • {selectedSession.academicWeeks} academic •{" "}
                  {selectedSession.totalBreakWeeks} break
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card className="shadow-sm">
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{format(currentDate, "MMMM yyyy")}</CardTitle>
              <CardDescription>
                {selectedSession ? `${selectedSession.name} Calendar` : "Select a session to view calendar"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateMonth("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateMonth("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="p-1.5 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map((day) => {
              const dayStatus = getDayStatus(day)
              const events = getEventsForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isCurrentDay = isToday(day)

              return (
                <div
                  key={day.toISOString()}
                  className={`
                    min-h-[54px] p-1 border rounded-md relative
                    ${!isCurrentMonth ? "opacity-50" : ""}
                    ${isCurrentDay ? "ring-2 ring-blue-500" : ""}
                    ${dayStatus === "term" ? "bg-green-50 border-green-200" : ""}
                    ${dayStatus === "break" ? "bg-orange-50 border-orange-200" : ""}
                    ${dayStatus === "inactive" ? "bg-muted/50" : ""}
                  `}
                >
                  <div className="mb-1 text-xs font-medium">{format(day, "d")}</div>

                  <div className="space-y-1">
                    {events.slice(0, 2).map((event, index) => (
                      <div
                        key={index}
                        className={`truncate rounded px-1 py-0.5 text-[10px] text-white ${event.color}`}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <div className="text-xs text-muted-foreground">+{events.length - 2} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-200 rounded"></div>
              <span className="text-xs">Term Period</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-200 rounded"></div>
              <span className="text-xs">Break Period</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-xs">Session Events</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-xs">Term Start</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-xs">Term End</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
