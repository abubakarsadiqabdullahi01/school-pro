"use client"

import { useState, useEffect } from "react"
import { BarChart3, Building, GraduationCap, School, Users } from "lucide-react"

import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { PageTransition } from "@/components/dashboard/page-transition"

// Mock data for recent activities
const recentActivities = [
  {
    id: "1",
    user: {
      name: "System Admin",
      role: "Super Admin",
    },
    action: "added new school",
    target: "Lincoln High School",
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: "2",
    user: {
      name: "Jane Smith",
      role: "Super Admin",
    },
    action: "updated system settings for",
    target: "All Schools",
    date: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
  },
  {
    id: "3",
    user: {
      name: "Robert Johnson",
      role: "Admin",
    },
    action: "requested access to",
    target: "Financial Module",
    date: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
  },
  {
    id: "4",
    user: {
      name: "System",
      role: "Automated",
    },
    action: "performed database backup for",
    target: "All Schools",
    date: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
  },
  {
    id: "5",
    user: {
      name: "Maria Garcia",
      role: "Super Admin",
    },
    action: "created new admin account for",
    target: "Washington Elementary School",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
]

export default function SuperAdminDashboardPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading system data..." />
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">System Dashboard</h2>
            <p className="text-muted-foreground">Overview of all schools and system performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button>System Report</Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schools">Schools</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatsCard
                title="Total Schools"
                value="24"
                icon={School}
                trend={{ value: 2, isPositive: true }}
                delay={0}
              />
              <StatsCard
                title="Total Students"
                value="28,459"
                icon={GraduationCap}
                trend={{ value: 8, isPositive: true }}
                delay={1}
              />
              <StatsCard
                title="Total Staff"
                value="1,865"
                icon={Users}
                trend={{ value: 5, isPositive: true }}
                delay={2}
              />
              <StatsCard title="System Uptime" value="99.98%" icon={Building} description="Last 30 days" delay={3} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>System Usage</CardTitle>
                  <CardDescription>Active users across all schools</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                    Usage Chart Placeholder
                  </div>
                </CardContent>
              </Card>

              <RecentActivity activities={recentActivities} className="lg:col-span-3" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Schools</CardTitle>
                  <CardDescription>Based on academic performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: "Lincoln High School", score: "94.5%" },
                      { name: "Washington Elementary", score: "92.8%" },
                      { name: "Jefferson Middle School", score: "91.2%" },
                    ].map((school, i) => (
                      <div key={i} className="flex justify-between">
                        <div className="font-medium">{school.name}</div>
                        <div className="text-muted-foreground">{school.score}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent System Alerts</CardTitle>
                  <CardDescription>System notifications and alerts</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { message: "Database optimization completed", level: "Info", time: "2 hours ago" },
                      { message: "Storage usage at 75%", level: "Warning", time: "1 day ago" },
                      { message: "System update scheduled", level: "Info", time: "2 days ago" },
                    ].map((alert, i) => (
                      <div key={i} className="flex justify-between">
                        <div>
                          <div className="font-medium">{alert.message}</div>
                          <div className="text-sm text-muted-foreground">{alert.level}</div>
                        </div>
                        <div className="text-muted-foreground">{alert.time}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>System administration actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    <Button className="w-full justify-start">
                      <School className="mr-2 h-4 w-4" />
                      Add New School
                    </Button>
                    <Button className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" />
                      Manage Admins
                    </Button>
                    <Button className="w-full justify-start">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      System Reports
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="schools" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Schools Overview</CardTitle>
                <CardDescription>All schools in the system</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  Schools Map Placeholder
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Overview of all system users</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  Users Table Placeholder
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>System performance and health metrics</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                <div className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">
                  System Health Dashboard Placeholder
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
