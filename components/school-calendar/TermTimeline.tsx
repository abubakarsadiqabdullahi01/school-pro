"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarDays, Clock, Coffee } from "lucide-react"
import { format } from "date-fns"

interface TermTimelineProps {
  sessions: any[]
  selectedSession: any
  onSessionSelect: (session: any) => void
}

export function TermTimeline({ sessions, selectedSession, onSessionSelect }: TermTimelineProps) {
  const getTimelineItems = () => {
    if (!selectedSession) return []

    const items: any[] = []

    // Add session start
    items.push({
      type: "session-start",
      date: new Date(selectedSession.startDate),
      title: `${selectedSession.name} Begins`,
      description: "Academic session starts",
      color: "blue",
    })

    // Add terms and breaks
    selectedSession.terms?.forEach((term: any, index: number) => {
      // Add term start
      items.push({
        type: "term-start",
        date: new Date(term.startDate),
        title: `${term.name} Starts`,
        description: `${term.weeks} weeks • ${term.progressPercentage}% complete`,
        color: "green",
        term,
      })

      // Add term end
      items.push({
        type: "term-end",
        date: new Date(term.endDate),
        title: `${term.name} Ends`,
        description: `Term concludes`,
        color: "red",
        term,
      })

      // Add break after term (if not last term)
      if (index < selectedSession.terms.length - 1) {
        const breakPeriod = selectedSession.breaks?.[index]
        if (breakPeriod) {
          items.push({
            type: "break-start",
            date: new Date(breakPeriod.startDate),
            title: "Break Period Starts",
            description: `${breakPeriod.weeks} week${breakPeriod.weeks !== 1 ? "s" : ""} break`,
            color: "orange",
            break: breakPeriod,
          })
        }
      }
    })

    // Add session end
    items.push({
      type: "session-end",
      date: new Date(selectedSession.endDate),
      title: `${selectedSession.name} Ends`,
      description: "Academic session concludes",
      color: "blue",
    })

    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  const timelineItems = getTimelineItems()
  const now = new Date()

  return (
    <div className="space-y-6">
      {/* Session Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Academic Timeline</CardTitle>
          <CardDescription>View the chronological timeline of your academic sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Session</label>
            <Select
              value={selectedSession?.id || ""}
              onValueChange={(value) => {
                const session = sessions.find((s) => s.id === value)
                if (session) onSessionSelect(session)
              }}
            >
              <SelectTrigger className="w-[300px]">
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
        </CardContent>
      </Card>

      {/* Timeline */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedSession.name} Timeline</CardTitle>
            <CardDescription>Complete timeline with terms, breaks, and milestones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border"></div>

              <div className="space-y-6">
                {timelineItems.map((item, index) => {
                  const isPast = item.date < now
                  const isCurrent =
                    item.type.includes("start") &&
                    item.term &&
                    now >= new Date(item.term.startDate) &&
                    now <= new Date(item.term.endDate)

                  return (
                    <div key={index} className="relative flex items-start gap-4">
                      {/* Timeline dot */}
                      <div
                        className={`
                        relative z-10 w-4 h-4 rounded-full border-2 
                        ${
                          isPast
                            ? "bg-green-500 border-green-500"
                            : isCurrent
                              ? "bg-blue-500 border-blue-500"
                              : "bg-white border-gray-300"
                        }
                      `}
                      >
                        {isCurrent && (
                          <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-75"></div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{item.title}</h4>
                          <Badge variant={isPast ? "secondary" : isCurrent ? "default" : "outline"} className="text-xs">
                            {isPast ? "Completed" : isCurrent ? "Current" : "Upcoming"}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {format(item.date, "MMM dd, yyyy")}
                          </div>

                          {item.term && (
                            <>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.term.weeks} weeks
                              </div>
                              <div className="flex-1 max-w-[200px]">
                                <div className="flex justify-between text-xs mb-1">
                                  <span>Progress</span>
                                  <span>{item.term.progressPercentage}%</span>
                                </div>
                                <Progress value={item.term.progressPercentage} className="h-1" />
                              </div>
                            </>
                          )}

                          {item.break && (
                            <div className="flex items-center gap-1">
                              <Coffee className="h-3 w-3" />
                              {item.break.weeks} week{item.break.weeks !== 1 ? "s" : ""} break
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
