"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { CalendarDays, Clock, Coffee, BookOpen } from "lucide-react"

interface CalendarStatsProps {
  sessions: any[]
}

export function CalendarStats({ sessions }: CalendarStatsProps) {
  // Prepare data for charts
  const sessionData = sessions.map((session) => ({
    name: session.name,
    totalWeeks: session.totalWeeks,
    academicWeeks: session.academicWeeks,
    breakWeeks: session.totalBreakWeeks,
    terms: session.terms.length,
    progress: session.progressPercentage,
  }))

  const termDistribution = sessions.reduce((acc: any[], session) => {
    session.terms.forEach((term: any) => {
      acc.push({
        session: session.name,
        term: term.name,
        weeks: term.weeks,
        progress: term.progressPercentage,
        status: term.status,
      })
    })
    return acc
  }, [])

  const breakAnalysis = sessions.reduce((acc: any[], session) => {
    session.breaks?.forEach((breakPeriod: any, index: number) => {
      acc.push({
        session: session.name,
        break: `Break ${index + 1}`,
        weeks: breakPeriod.weeks,
        type: breakPeriod.type,
      })
    })
    return acc
  }, [])

  const pieData = [
    { name: "Academic Weeks", value: sessions.reduce((sum, s) => sum + s.academicWeeks, 0), color: "#10b981" },
    { name: "Break Weeks", value: sessions.reduce((sum, s) => sum + s.totalBreakWeeks, 0), color: "#f59e0b" },
  ]

  const averageStats = {
    avgSessionWeeks:
      sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.totalWeeks, 0) / sessions.length) : 0,
    avgAcademicWeeks:
      sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.academicWeeks, 0) / sessions.length) : 0,
    avgBreakWeeks:
      sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.totalBreakWeeks, 0) / sessions.length) : 0,
    avgTerms:
      sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.terms.length, 0) / sessions.length) : 0,
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
            <p className="text-xs text-muted-foreground">
              {sessions.filter((s) => s.isCurrent).length} currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Session Length</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageStats.avgSessionWeeks}</div>
            <p className="text-xs text-muted-foreground">weeks per session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Academic Weeks</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageStats.avgAcademicWeeks}</div>
            <p className="text-xs text-muted-foreground">learning weeks per session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Break Weeks</CardTitle>
            <Coffee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageStats.avgBreakWeeks}</div>
            <p className="text-xs text-muted-foreground">break weeks per session</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Session Comparison</CardTitle>
            <CardDescription>Compare academic and break weeks across sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sessionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="academicWeeks" fill="#10b981" name="Academic Weeks" />
                <Bar dataKey="breakWeeks" fill="#f59e0b" name="Break Weeks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Academic vs Break Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Time Distribution</CardTitle>
            <CardDescription>Overall academic vs break time distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Term Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Term Analysis</CardTitle>
          <CardDescription>Detailed breakdown of terms across all sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{session.name}</h4>
                  <Badge variant="outline">
                    {session.terms.length} terms • {session.totalWeeks} weeks
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {session.terms.map((term: any) => (
                    <div key={term.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{term.name}</span>
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

                      <div className="text-xs text-muted-foreground">
                        {term.weeks} weeks • {term.progressPercentage}% complete
                      </div>

                      <Progress value={term.progressPercentage} className="h-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Break Analysis */}
      {breakAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Break Period Analysis</CardTitle>
            <CardDescription>Analysis of break periods across sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={breakAnalysis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="break" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="weeks" fill="#f59e0b" name="Break Weeks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
