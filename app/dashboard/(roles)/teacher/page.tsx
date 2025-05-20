"use client"

import { useState, useEffect } from "react"
import { BookOpen, Calendar, CheckCircle, Clock, FileText, GraduationCap } from "lucide-react"

import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// Mock data for recent activities
const recentActivities = [
  {
    id: "1",
    user: {
      name: "You",
      role: "Teacher",
    },
    action: "graded assignment for",
    target: "Physics Class 11A",
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: "2",
    user: {
      name: "Principal Johnson",
      role: "Admin",
    },
    action: "scheduled meeting with",
    target: "Science Department",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: "3",
    user: {
      name: "Alex Thompson",
      role: "Student",
    },
    action: "submitted late assignment for",
    target: "Chemistry Class",
    date: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: "4",
    user: {
      name: "Sarah Wilson",
      role: "Parent",
    },
    action: "requested meeting about",
    target: "Student Michael Wilson",
    date: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: "5",
    user: {
      name: "You",
      role: "Teacher",
    },
    action: "uploaded lesson plan for",
    target: "Biology Class 10B",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
]

export default function TeacherDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading your classes..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h2>
          <p className="text-muted-foreground">Welcome back, Professor Anderson</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>Create Lesson Plan</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">My Classes</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="My Classes" value="6" icon={BookOpen} delay={0} />
            <StatsCard title="Total Students" value="187" icon={GraduationCap} delay={1} />
            <StatsCard title="Pending Assignments" value="24" icon={FileText} description="Needs grading" delay={2} />
            <StatsCard title="Today's Classes" value="3" icon={Calendar} description="2 remaining" delay={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Class Performance</CardTitle>
                <CardDescription>Average grades by class</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  Performance Chart Placeholder
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
                    { name: "Physics 11A", time: "8:30 AM - 9:30 AM", status: "Completed" },
                    { name: "Chemistry 10B", time: "11:00 AM - 12:00 PM", status: "Current" },
                    { name: "Biology 9C", time: "2:15 PM - 3:15 PM", status: "Upcoming" },
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
                <CardTitle>Assignments Due</CardTitle>
                <CardDescription>Upcoming assignment deadlines</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Physics Quiz", class: "Physics 11A", date: "Today" },
                    { name: "Lab Report", class: "Chemistry 10B", date: "Tomorrow" },
                    { name: "Term Paper", class: "Biology 9C", date: "May 15" },
                  ].map((assignment, i) => (
                    <div key={i} className="flex justify-between">
                      <div>
                        <div className="font-medium">{assignment.name}</div>
                        <div className="text-sm text-muted-foreground">{assignment.class}</div>
                      </div>
                      <div className="text-muted-foreground">{assignment.date}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common teaching tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Button className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4" />
                    Create Assignment
                  </Button>
                  <Button className="w-full justify-start">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Take Attendance
                  </Button>
                  <Button className="w-full justify-start">
                    <Clock className="mr-2 h-4 w-4" />
                    Schedule Office Hours
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
              <CardDescription>All classes you're teaching this semester</CardDescription>
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
              <CardDescription>Manage and grade student assignments</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Assignments Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Schedule</CardTitle>
              <CardDescription>Your teaching schedule for the week</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Schedule Calendar Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

