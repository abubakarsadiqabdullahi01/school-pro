"use client"

import { Separator } from "@/components/ui/separator"

import { Button } from "@/components/ui/button"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  Users,
  School,
  Calendar,
  GraduationCap,
  Activity,
  AlertTriangle,
  PieChartIcon,
  BarChartIcon,
  LineChartIcon,
  CheckCircle,
  User,
  CalendarDays,
  ClipboardList,
  Wallet,
} from "lucide-react"
import { getSystemAnalytics } from "@/app/actions/analytics"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { motion } from "framer-motion"

interface AnalyticsData {
  totalSchools: number
  totalStudents: number
  totalTeachers: number
  totalAdmins: number
  totalParents: number
  totalSessions: number
  totalTerms: number
  totalClasses: number
  totalSubjects: number
  activeSchoolsCount: number
  inactiveSchoolsCount: number
  userRoleDistribution: { role: string; count: number }[]
  studentEnrollmentByYear: { year: string; students: number }[]
  schoolSizeDistribution: { schoolName: string; studentCount: number }[]
  topPerformingSchools: { schoolName: string; students: number }[]
  recentActivities: {
    recentUsers: { firstName: string; lastName: string; role: string; createdAt: Date }[]
    recentSessions: { name: string; school: { name: string }; createdAt: Date }[]
    recentTerms: { name: string; session: { name: string }; createdAt: Date }[]
  }
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"]

export function SuperAdminAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true)
      setError(null)
      const result = await getSystemAnalytics()
      if (result.success) {
        setAnalyticsData(result.data)
      } else {
        setError(result.error || "Failed to fetch analytics data.")
        toast.error("Error fetching analytics", { description: result.error || "Please try again." })
      }
      setIsLoading(false)
    }
    fetchAnalytics()
  }, [])

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="space-y-6 p-6"
      >
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </motion.div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-xl font-semibold">Error Loading Analytics</h3>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  if (!analyticsData) {
    return null // Should not happen if error is handled
  }


  const userRoleChartData = analyticsData.userRoleDistribution.map((item, index) => ({
    name: item.role.replace("_", " "),
    count: item.count,
    color: COLORS[index % COLORS.length],
  }))

  const studentEnrollmentChartConfig = {
    students: {
      label: "Students",
      color: "hsl(var(--primary))",
    },
  }

  const schoolSizeChartConfig = {
    studentCount: {
      label: "Students",
      color: "hsl(var(--primary))",
    },
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 p-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Analytics</h2>
        <p className="text-muted-foreground">Comprehensive overview of the entire school management system</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalSchools}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsData.activeSchoolsCount} active, {analyticsData.inactiveSchoolsCount} inactive
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalStudents}</div>
            <p className="text-xs text-muted-foreground">+20.1% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalTeachers}</div>
            <p className="text-xs text-muted-foreground">+15% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalSessions}</div>
            <p className="text-xs text-muted-foreground">{analyticsData.totalTerms} terms across all sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Distributions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Student Enrollment Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5" />
              Student Enrollment Trend
            </CardTitle>
            <CardDescription>Enrollment numbers over academic years</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={studentEnrollmentChartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.studentEnrollmentByYear}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, "auto"]} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line
                    dataKey="students"
                    type="natural"
                    stroke="var(--color-students)"
                    strokeWidth={2}
                    dot={{
                      fill: "var(--color-students)",
                    }}
                    activeDot={{
                      r: 6,
                      fill: "var(--color-students)",
                      stroke: "white",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* User Role Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              User Role Distribution
            </CardTitle>
            <CardDescription>Breakdown of users by their assigned roles</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer
              config={{
                count: {
                  label: "Count",
                },
              }}
              className="h-[300px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userRoleChartData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {userRoleChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* School Size Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChartIcon className="h-5 w-5" />
              School Size Distribution
            </CardTitle>
            <CardDescription>Number of students per school</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={schoolSizeChartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.schoolSizeDistribution}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="schoolName" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, "auto"]} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="studentCount" fill="var(--color-studentCount)" radius={8} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent System Activities
            </CardTitle>
            <CardDescription>Latest changes and additions to the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <h4 className="text-sm font-medium">New Users</h4>
            <ul className="space-y-2">
              {analyticsData.recentActivities.recentUsers.map((user, index) => (
                <li key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {user.firstName} {user.lastName} (<Badge variant="secondary">{user.role}</Badge>)
                    </span>
                  </div>
                  <span className="text-muted-foreground">{format(new Date(user.createdAt), "MMM d, yyyy")}</span>
                </li>
              ))}
            </ul>
            <Separator />
            <h4 className="text-sm font-medium">New Sessions & Terms</h4>
            <ul className="space-y-2">
              {analyticsData.recentActivities.recentSessions.map((session, index) => (
                <li key={`session-${index}`} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Session: {session.name} ({session.school.name})
                    </span>
                  </div>
                  <span className="text-muted-foreground">{format(new Date(session.createdAt), "MMM d, yyyy")}</span>
                </li>
              ))}
              {analyticsData.recentActivities.recentTerms.map((term, index) => (
                <li key={`term-${index}`} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Term: {term.name} (Session: {term.session.name})
                    </span>
                  </div>
                  <span className="text-muted-foreground">{format(new Date(term.createdAt), "MMM d, yyyy")}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Additional Sections (Placeholders) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Financial Overview
            </CardTitle>
            <CardDescription>Summary of payments and fee collections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground">Financial data coming soon...</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Assessment Statistics
            </CardTitle>
            <CardDescription>Insights into student performance and assessment trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground">Assessment data coming soon...</div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
