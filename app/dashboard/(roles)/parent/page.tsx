"use client"

import { useState, useEffect } from "react"
import { Calendar, CheckCircle, DollarSign, FileText, Users } from "lucide-react"

import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Mock data for recent activities
const recentActivities = [
  {
    id: "1",
    user: {
      name: "Ms. Johnson",
      role: "Teacher",
    },
    action: "posted grades for",
    target: "Emma in Mathematics",
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: "2",
    user: {
      name: "Principal Davis",
      role: "Admin",
    },
    action: "announced school event",
    target: "Annual Sports Day",
    date: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
  },
  {
    id: "3",
    user: {
      name: "Emma",
      role: "Student",
    },
    action: "submitted assignment for",
    target: "Science Class",
    date: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: "4",
    user: {
      name: "You",
      role: "Parent",
    },
    action: "paid fees for",
    target: "Term 2",
    date: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: "5",
    user: {
      name: "Mr. Wilson",
      role: "Teacher",
    },
    action: "requested meeting about",
    target: "Jack's behavior",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
]

export default function ParentDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading your children's data..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Parent Dashboard</h2>
          <p className="text-muted-foreground">Welcome back, Mr. Thompson</p>
        </div>
        <div className="flex items-center gap-2">
          <Button>Schedule Meeting</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="children">My Children</TabsTrigger>
          <TabsTrigger value="academics">Academics</TabsTrigger>
          <TabsTrigger value="finances">Finances</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard title="Children" value="2" icon={Users} delay={0} />
            <StatsCard
              title="Average Attendance"
              value="97.5%"
              icon={CheckCircle}
              description="This semester"
              delay={1}
            />
            <StatsCard title="Upcoming Events" value="3" icon={Calendar} description="Next 7 days" delay={2} />
            <StatsCard title="Fee Status" value="Paid" icon={DollarSign} description="Current term" delay={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Academic Performance</CardTitle>
                <CardDescription>Your children's grades by subject</CardDescription>
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
                <CardTitle>My Children</CardTitle>
                <CardDescription>Quick access to your children's profiles</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Emma Thompson", grade: "Grade 8", image: "/placeholder.svg?height=40&width=40" },
                    { name: "Jack Thompson", grade: "Grade 5", image: "/placeholder.svg?height=40&width=40" },
                  ].map((child, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={child.image} alt={child.name} />
                        <AvatarFallback>{child.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{child.name}</div>
                        <div className="text-sm text-muted-foreground">{child.grade}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming Events</CardTitle>
                <CardDescription>School events and meetings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Parent-Teacher Meeting", date: "Tomorrow, 2:00 PM" },
                    { name: "Annual Sports Day", date: "May 15, 9:00 AM" },
                    { name: "School Trip Payment Due", date: "May 20" },
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
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common parent tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Button className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4" />
                    View Report Cards
                  </Button>
                  <Button className="w-full justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    Request Leave
                  </Button>
                  <Button className="w-full justify-start">
                    <DollarSign className="mr-2 h-4 w-4" />
                    Pay Fees
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="children" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Children</CardTitle>
              <CardDescription>Detailed information about your children</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Children Profiles Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Academic Progress</CardTitle>
              <CardDescription>Your children's academic performance</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Academic Progress Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finances" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Overview</CardTitle>
              <CardDescription>Fee payments and financial records</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                Financial Records Table Placeholder
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

