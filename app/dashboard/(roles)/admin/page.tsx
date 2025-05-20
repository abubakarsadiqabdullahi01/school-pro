"use client"

import { useState, useEffect } from "react"
import { BarChart3, BookOpen, Calendar, GraduationCap, Users } from "lucide-react"

import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

// Mock data for recent activities
const recentActivities = [
  {
    id: "1",
    user: {
      name: "John Smith",
      role: "Teacher",
    },
    action: "submitted grades for",
    target: "Class 10A Mathematics",
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: "2",
    user: {
      name: "Sarah Johnson",
      role: "Admin",
    },
    action: "approved leave request for",
    target: "Teacher David Wilson",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: "3",
    user: {
      name: "Michael Brown",
      role: "Student",
    },
    action: "submitted assignment for",
    target: "Physics Class",
    date: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: "4",
    user: {
      name: "Emily Davis",
      role: "Parent",
    },
    action: "paid fees for",
    target: "Student Alex Davis",
    date: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: "5",
    user: {
      name: "Robert Wilson",
      role: "Admin",
    },
    action: "created new class",
    target: "11B Science",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
]

export default function AdminDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading dashboard data..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">Overview of your school's performance and activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>Download Report</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="academics">Academics</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Students"
              value="1,245"
              icon={GraduationCap}
              trend={{ value: 12, isPositive: true }}
              delay={0}
            />
            <StatsCard
              title="Total Teachers"
              value="86"
              icon={Users}
              trend={{ value: 4, isPositive: true }}
              delay={1}
            />
            <StatsCard title="Classes" value="42" icon={BookOpen} delay={2} />
            <StatsCard title="Upcoming Events" value="8" icon={Calendar} description="In the next 30 days" delay={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Attendance Overview</CardTitle>
                <CardDescription>Average attendance rate for the current month</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  Chart Placeholder
                </div>
              </CardContent>
            </Card>

            <RecentActivity activities={recentActivities} className="lg:col-span-3" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Events</CardTitle>
                <CardDescription>Events scheduled for the next 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Parent-Teacher Meeting", date: "Tomorrow, 2:00 PM" },
                    { name: "Annual Sports Day", date: "May 15, 9:00 AM" },
                    { name: "Science Exhibition", date: "May 20, 10:00 AM" },
                  ].map((event, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="font-medium">{event.name}</div>
                      <div className="text-muted-foreground">{event.date}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Admissions</CardTitle>
                <CardDescription>New students admitted this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Emma Thompson", grade: "Grade 8", date: "May 2" },
                    { name: "James Wilson", grade: "Grade 5", date: "May 4" },
                    { name: "Sophia Martinez", grade: "Grade 10", date: "May 7" },
                  ].map((student, i) => (
                    <div key={i} className="flex justify-between">
                      <div>
                        <div className="font-medium">{student.name}</div>
                        <div className="text-sm text-muted-foreground">{student.grade}</div>
                      </div>
                      <div className="text-muted-foreground">{student.date}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Frequently used administrative actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Button className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Add New Student
                  </Button>
                  <Button className="w-full justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Event
                  </Button>
                  <Button className="w-full justify-start">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Generate Reports
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="academics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Academic Performance</CardTitle>
              <CardDescription>Overview of academic performance by grade</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Academic Performance Chart Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Trends</CardTitle>
              <CardDescription>Monthly attendance trends by grade</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Attendance Chart Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Overview</CardTitle>
              <CardDescription>Income and expenses for the current academic year</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Finance Chart Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

