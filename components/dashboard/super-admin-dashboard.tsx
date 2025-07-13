"use client"

import { useState } from "react"
import {
  BarChart3,
  Building,
  GraduationCap,
  School,
  Users,
  UserCog,
  Calendar,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"

interface SystemStats {
  totalSchools: number
  totalStudents: number
  totalTeachers: number
  totalAdmins: number
  totalParents: number
  activeSchools: number
  inactiveSchools: number
  systemUptime: number
  recentActivities: Array<{
    id: string
    user: { name: string; role: string }
    action: string
    target: string
    date: Date
  }>
}

interface SchoolPerformance {
  topPerformingSchools: Array<{
    id: string
    name: string
    code: string
    studentCount: number
    teacherCount: number
    performanceScore: number
  }>
  systemAlerts: Array<{
    id: string
    type: "info" | "warning" | "error"
    message: string
    timestamp: Date
  }>
  monthlyGrowth: {
    schools: number
    students: number
    teachers: number
  }
}

interface SuperAdminDashboardProps {
  stats: SystemStats
  schoolPerformance: SchoolPerformance
}

export function SuperAdminDashboard({ stats, schoolPerformance }: SuperAdminDashboardProps) {
  const [selectedTab, setSelectedTab] = useState("overview")

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />
    }
  }

  const getAlertBadgeVariant = (type: string) => {
    switch (type) {
      case "error":
        return "destructive"
      case "warning":
        return "secondary"
      default:
        return "default"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Dashboard</h2>
          <p className="text-muted-foreground">Overview of all schools and system performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard/super-admin/analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              System Report
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schools">Schools</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Schools"
              value={stats.totalSchools.toString()}
              icon={School}
              trend={{
                value: schoolPerformance.monthlyGrowth.schools,
                isPositive: schoolPerformance.monthlyGrowth.schools >= 0,
              }}
              delay={0}
            />
            <StatsCard
              title="Total Students"
              value={stats.totalStudents.toLocaleString()}
              icon={GraduationCap}
              trend={{
                value: schoolPerformance.monthlyGrowth.students,
                isPositive: schoolPerformance.monthlyGrowth.students >= 0,
              }}
              delay={1}
            />
            <StatsCard
              title="Total Teachers"
              value={stats.totalTeachers.toLocaleString()}
              icon={Users}
              trend={{
                value: schoolPerformance.monthlyGrowth.teachers,
                isPositive: schoolPerformance.monthlyGrowth.teachers >= 0,
              }}
              delay={2}
            />
            <StatsCard
              title="System Uptime"
              value={`${stats.systemUptime.toFixed(2)}%`}
              icon={Building}
              description="Last 30 days"
              delay={3}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {/* System Usage Chart */}
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>System Usage Trends</CardTitle>
                <CardDescription>User activity across all schools</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Active Schools</span>
                    <span className="text-sm text-muted-foreground">
                      {stats.activeSchools} of {stats.totalSchools}
                    </span>
                  </div>
                  <Progress value={(stats.activeSchools / stats.totalSchools) * 100} className="h-2" />

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{stats.activeSchools}</div>
                      <div className="text-sm text-muted-foreground">Active Schools</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{stats.inactiveSchools}</div>
                      <div className="text-sm text-muted-foreground">Inactive Schools</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <RecentActivity activities={stats.recentActivities} className="lg:col-span-3" />
          </div>

          {/* Bottom Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Top Performing Schools */}
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Schools</CardTitle>
                <CardDescription>Based on student enrollment and activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {schoolPerformance.topPerformingSchools.slice(0, 5).map((school, i) => (
                    <div key={school.id} className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {school.studentCount} students • {school.teacherCount} teachers
                        </div>
                      </div>
                      <Badge variant="secondary">{school.performanceScore}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>System Alerts</CardTitle>
                <CardDescription>Recent system notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {schoolPerformance.systemAlerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3">
                      {getAlertIcon(alert.type)}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{alert.message}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(alert.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant={getAlertBadgeVariant(alert.type) as any} className="text-xs">
                        {alert.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>System administration shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Button className="w-full justify-start" asChild>
                    <Link href="/dashboard/super-admin/schools/add">
                      <School className="mr-2 h-4 w-4" />
                      Add New School
                    </Link>
                  </Button>
                  <Button className="w-full justify-start" asChild>
                    <Link href="/dashboard/super-admin/users/admins">
                      <UserCog className="mr-2 h-4 w-4" />
                      Manage Admins
                    </Link>
                  </Button>
                  <Button className="w-full justify-start" asChild>
                    <Link href="/dashboard/super-admin/sessions">
                      <Calendar className="mr-2 h-4 w-4" />
                      Manage Sessions
                    </Link>
                  </Button>
                  <Button className="w-full justify-start" asChild>
                    <Link href="/dashboard/super-admin/analytics">
                      <BarChart3 className="mr-2 h-4 w-4" />
                      View Analytics
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schools" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>School Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Active Schools</span>
                    <span className="font-medium">{stats.activeSchools}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inactive Schools</span>
                    <span className="font-medium">{stats.inactiveSchools}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">Total</span>
                    <span className="font-medium">{stats.totalSchools}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>All Schools Performance</CardTitle>
                <CardDescription>Overview of school metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {schoolPerformance.topPerformingSchools.map((school) => (
                    <div key={school.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-sm text-muted-foreground">{school.code}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{school.studentCount} students</div>
                        <div className="text-sm text-muted-foreground">{school.teacherCount} teachers</div>
                      </div>
                      <Badge variant="outline">{school.performanceScore}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Administrators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalAdmins}</div>
                <p className="text-sm text-muted-foreground">School administrators</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Teachers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalTeachers.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">Teaching staff</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Students</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalStudents.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">Enrolled students</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Parents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalParents.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">Parent accounts</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Current system status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>System Uptime</span>
                    <Badge variant="default">{stats.systemUptime.toFixed(2)}%</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Active Schools</span>
                    <Badge variant="default">
                      {stats.activeSchools}/{stats.totalSchools}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Database Status</span>
                    <Badge variant="default">Healthy</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent System Events</CardTitle>
                <CardDescription>Latest system activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {schoolPerformance.systemAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-center gap-2 text-sm">
                      {getAlertIcon(alert.type)}
                      <span className="flex-1">{alert.message}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(alert.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
