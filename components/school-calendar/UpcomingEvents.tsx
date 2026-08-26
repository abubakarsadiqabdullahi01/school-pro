"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, BookOpen, Coffee, GraduationCap } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

interface UpcomingEventsProps {
  events: Array<{
    id: string
    title: string
    date: Date
    type: string
    description: string
  }>
}

export function UpcomingEvents({ events }: UpcomingEventsProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case "session-start":
      case "session-end":
        return <GraduationCap className="h-4 w-4" />
      case "term-start":
      case "term-end":
        return <BookOpen className="h-4 w-4" />
      case "break-start":
      case "break-end":
        return <Coffee className="h-4 w-4" />
      default:
        return <CalendarDays className="h-4 w-4" />
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case "session-start":
        return "bg-blue-500"
      case "session-end":
        return "bg-blue-600"
      case "term-start":
        return "bg-green-500"
      case "term-end":
        return "bg-red-500"
      case "break-start":
      case "break-end":
        return "bg-orange-500"
      default:
        return "bg-muted-foreground"
    }
  }

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Upcoming Events</CardTitle>
        <CardDescription>Important dates and milestones coming up</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No upcoming events</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {events.slice(0, 6).map((event) => (
              <div key={event.id} className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/20 p-2.5">
                <div
                  className={`
                  w-2 h-2 rounded-full mt-2 flex-shrink-0
                  ${getEventColor(event.type)}
                `}
                ></div>

                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    {getEventIcon(event.type)}
                    <h4 className="truncate text-sm font-medium">{event.title}</h4>
                  </div>

                  <p className="line-clamp-1 text-xs text-muted-foreground">{event.description}</p>

                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(event.date, "MMM dd, yyyy")}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(event.date, { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            ))}

            {events.length > 6 && (
              <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2 border-t pt-2 text-center">
                <span className="text-sm text-muted-foreground">+{events.length - 6} more events</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
