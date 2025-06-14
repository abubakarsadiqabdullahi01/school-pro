"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarDays, BookOpen, Coffee, Calendar, GraduationCap } from "lucide-react"
import { format, isAfter, isBefore, isWithinInterval } from "date-fns"
import { SessionCalendarView } from "./SessionCalendarView"
import { TermTimeline } from "./TermTimeline"
import { CalendarStats } from "./CalendarStats"
import { UpcomingEvents } from "./UpcomingEvents"
import { CalendarSettings } from "./CalendarSettings"

interface CalendarOverviewProps {
  initialData: any
}

export function CalendarOverview({ initialData }: CalendarOverviewProps) {
  const [calendarData, setCalendarData] = useState(initialData)
  const [selectedSession, setSelectedSession] = useState(initialData.currentSession || initialData.sessions[0])
  const [activeTab, setActiveTab] = useState("overview")

  const refreshData = async () => {
    // Refresh calendar data
    window.location.reload()
  }

  const getCurrentStatus = () => {
    if (!selectedSession) return { status: "No Session", color: "gray" }

    const now = new Date()
    const sessionStart = new Date(selectedSession.startDate)
    const sessionEnd = new Date(selectedSession.endDate)

    if (isBefore(now, sessionStart)) {
      return { status: "Upcoming", color: "blue" }
    } else if (isAfter(now, sessionEnd)) {
      return { status: "Completed", color: "green" }
    } else {
      // Check which term is current
      const currentTerm = selectedSession.terms.find((term: any) => {
        const termStart = new Date(term.startDate)
        const termEnd = new Date(term.endDate)
        return isWithinInterval(now, { start: termStart, end: termEnd })
      })

      if (currentTerm) {
        return { status: `${currentTerm.name} Active`, color: "green" }
      } else {
        return { status: "Break Period", color: "orange" }
      }
    }
  }

  const currentStatus = getCurrentStatus()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">School Calendar</h1>
          <p className="text-muted-foreground">Manage and track your academic sessions, terms, and schedules</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={currentStatus.color === "green" ? "default" : "secondary"}>{currentStatus.status}</Badge>
          <Button onClick={refreshData} variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Session</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedSession?.name || "None"}</div>
            <p className="text-xs text-muted-foreground">
              {selectedSession ? `${selectedSession.progressPercentage}% Complete` : "No active session"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Academic Weeks</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedSession?.academicWeeks || 0}</div>
            <p className="text-xs text-muted-foreground">{selectedSession?.completedWeeks || 0} weeks completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Break Weeks</CardTitle>
            <Coffee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedSession?.totalBreakWeeks || 0}</div>
            <p className="text-xs text-muted-foreground">Across {selectedSession?.breaks?.length || 0} break periods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Terms</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedSession?.terms?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {selectedSession?.terms?.filter((t: any) => t.status === "completed").length || 0} completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Session Progress */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Session Progress</CardTitle>
                  <CardDescription>Track the progress of your current academic session</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {selectedSession && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Overall Progress</span>
                          <span>{selectedSession.progressPercentage}%</span>
                        </div>
                        <Progress value={selectedSession.progressPercentage} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{format(new Date(selectedSession.startDate), "MMM dd, yyyy")}</span>
                          <span>{format(new Date(selectedSession.endDate), "MMM dd, yyyy")}</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium">Terms Progress</h4>
                        {selectedSession.terms.map((term: any) => (
                          <div key={term.id} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{term.name}</span>
                                <Badge
                                  variant={
                                    term.status === "current"
                                      ? "default"
                                      : term.status === "completed"
                                        ? "secondary"
                                        : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {term.status}
                                </Badge>
                              </div>
                              <span className="text-sm text-muted-foreground">{term.progressPercentage}%</span>
                            </div>
                            <Progress value={term.progressPercentage} className="h-1" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{format(new Date(term.startDate), "MMM dd")}</span>
                              <span>{term.weeks} weeks</span>
                              <span>{format(new Date(term.endDate), "MMM dd")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Events */}
            <div>
              <UpcomingEvents events={calendarData.upcomingEvents} />
            </div>
          </div>

          {/* Break Periods */}
          {selectedSession?.breaks && selectedSession.breaks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Break Periods</CardTitle>
                <CardDescription>Scheduled breaks and holidays in {selectedSession.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedSession.breaks.map((breakPeriod: any, index: number) => (
                    <div key={index} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{breakPeriod.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {breakPeriod.weeks} week{breakPeriod.weeks !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(breakPeriod.startDate), "MMM dd")} -{" "}
                        {format(new Date(breakPeriod.endDate), "MMM dd, yyyy")}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {breakPeriod.type.replace("-", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <SessionCalendarView
            sessions={calendarData.sessions}
            selectedSession={selectedSession}
            onSessionSelect={setSelectedSession}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <TermTimeline
            sessions={calendarData.sessions}
            selectedSession={selectedSession}
            onSessionSelect={setSelectedSession}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <CalendarStats sessions={calendarData.sessions} />
        </TabsContent>

        <TabsContent value="settings">
          <CalendarSettings sessions={calendarData.sessions} onUpdate={refreshData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
