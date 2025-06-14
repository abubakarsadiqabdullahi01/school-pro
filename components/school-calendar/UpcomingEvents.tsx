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
        return "bg-gray-500"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Events</CardTitle>
        <CardDescription>Important dates and milestones coming up</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div
                  className={`
                  w-2 h-2 rounded-full mt-2 flex-shrink-0
                  ${getEventColor(event.type)}
                `}
                ></div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getEventIcon(event.type)}
                    <h4 className="font-medium text-sm">{event.title}</h4>
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">{event.description}</p>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{format(event.date, "MMM dd, yyyy")}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(event.date, { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            ))}

            {events.length > 8 && (
              <div className="text-center pt-2 border-t">
                <span className="text-sm text-muted-foreground">+{events.length - 8} more events</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
