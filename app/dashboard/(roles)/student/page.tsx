"use client"

import { useState, useEffect } from "react"
import { BookOpen, Calendar, CheckCircle, Clock, FileText } from "lucide-react"

import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

// Mock data for recent activities
const recentActivities = [
  {
    id: "1",
    user: {
      name: "Ms. Johnson",
      role: "Teacher",
    },
    action: "graded your assignment in",
    target: "Mathematics",
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: "2",
    user: {
      name: "You",
      role: "Student",
    },
    action: "submitted assignment for",
    target: "Physics Class",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: "3",
    user: {
      name: "Mr. Wilson",
      role: "Teacher",
    },
    action: "posted new material in",
    target: "History Class",
    date: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: "4",
    user: {
      name: "Principal Davis",
      role: "Admin",
    },
    action: "announced school event",
    target: "Annual Sports Day",
    date: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: "5",
    user: {
      name: "You",
      role: "Student",
    },
    action: "registered for",
    target: "Science Club",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
]

export default function StudentDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading your academic data..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Student Dashboard</h2>
          <p className="text-muted-foreground">Welcome back, Alex Thompson</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>View Timetable</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">My Classes</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="My Classes" value="8" icon={BookOpen} delay={0} />
            <StatsCard title="Attendance" value="96%" icon={CheckCircle} description="This semester" delay={1} />
            <StatsCard title="Pending Assignments" value="5" icon={FileText} description="Due this week" delay={2} />
            <StatsCard title="Today's Classes" value="4" icon={Calendar} description="2 completed" delay={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Academic Performance</CardTitle>
                <CardDescription>Your grades by subject</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  Grades Chart Placeholder
                </div>
              </CardContent>
            </Card>

            <RecentActivity activities={recentActivities} className="lg:col-span-3" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Today's Schedule</CardTitle>
                <CardDescription>Your classes for today</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Mathematics", time: "8:30 AM - 9:30 AM", status: "Completed" },
                    { name: "Physics", time: "10:00 AM - 11:00 AM", status: "Completed" },
                    { name: "English", time: "1:00 PM - 2:00 PM", status: "Current" },
                    { name: "History", time: "2:15 PM - 3:15 PM", status: "Upcoming" },
                  ].map((cls, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{cls.name}</div>
                        <div className="text-sm text-muted-foreground">{cls.time}</div>
                      </div>
                      <Badge
                        variant={
                          cls.status === "Completed" ? "outline" : cls.status === "Current" ? "default" : "secondary"
                        }
                      >
                        {cls.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming Assignments</CardTitle>
                <CardDescription>Assignments due soon</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Math Problem Set", subject: "Mathematics", date: "Today", progress: 75 },
                    { name: "Physics Lab Report", subject: "Physics", date: "Tomorrow", progress: 30 },
                    { name: "English Essay", subject: "English", date: "May 15", progress: 10 },
                  ].map((assignment, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between">
                        <div>
                          <div className="font-medium">{assignment.name}</div>
                          <div className="text-sm text-muted-foreground">{assignment.subject}</div>
                        </div>
                        <div className="text-muted-foreground">{assignment.date}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={assignment.progress} className="h-2" />
                        <span className="text-xs text-muted-foreground">{assignment.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common student tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Button className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4" />
                    Submit Assignment
                  </Button>
                  <Button className="w-full justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    View Exam Schedule
                  </Button>
                  <Button className="w-full justify-start">
                    <Clock className="mr-2 h-4 w-4" />
                    Request Meeting
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="classes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Classes</CardTitle>
              <CardDescription>All classes you're enrolled in this semester</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Classes Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assignments</CardTitle>
              <CardDescription>Your current and past assignments</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Assignments Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Academic Record</CardTitle>
              <CardDescription>Your grades and academic performance</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Grades Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

