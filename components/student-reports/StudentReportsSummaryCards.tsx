"use client"

import { memo } from "react"
import { Users, TrendingUp, Target, CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"

interface SummaryStats {
  totalStudents: number
  studentsWithResults: number
  averageScore: number
  passRate: number
  reportsGenerated: number
}

interface StudentReportsSummaryCardsProps {
  summaryStats: SummaryStats
  gradingSystem: any
  isLoading: boolean
}

export const StudentReportsSummaryCards = memo(function StudentReportsSummaryCards({
  summaryStats,
  gradingSystem,
  isLoading,
}: StudentReportsSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const getPerformanceColor = (score: number) => {
    if (score >= 70) return "text-green-600"
    if (score >= 60) return "text-blue-600"
    if (score >= 50) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  const readinessPercentage =
    summaryStats.totalStudents > 0 ? (summaryStats.studentsWithResults / summaryStats.totalStudents) * 100 : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Total Students
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summaryStats.totalStudents}</div>
          <p className="text-xs text-muted-foreground mt-1">Enrolled in this class</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Report Readiness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${readinessPercentage >= 100 ? "text-green-600" : readinessPercentage >= 50 ? "text-yellow-600" : "text-red-600"}`}
          >
            {readinessPercentage.toFixed(0)}%
          </div>
          <Progress value={readinessPercentage} className="h-2 mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {summaryStats.studentsWithResults} of {summaryStats.totalStudents} students with results
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Class Average
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getPerformanceColor(summaryStats.averageScore)}`}>
            {summaryStats.averageScore.toFixed(1)}%
          </div>
          <Progress value={summaryStats.averageScore} className="h-2 mt-2" />
          <p className="text-xs text-muted-foreground mt-1">Based on {summaryStats.studentsWithResults} students</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" />
            Pass Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${summaryStats.passRate >= 70 ? "text-green-600" : summaryStats.passRate >= 50 ? "text-yellow-600" : "text-red-600"}`}
          >
            {summaryStats.passRate.toFixed(1)}%
          </div>
          <Progress
            value={summaryStats.passRate}
            className={`h-2 mt-2 ${summaryStats.passRate >= 70 ? "bg-green-100" : summaryStats.passRate >= 50 ? "bg-yellow-100" : "bg-red-100"}`}
          />
          <p className="text-xs text-muted-foreground mt-1">Pass mark: {gradingSystem?.passMark || 40}%</p>
        </CardContent>
      </Card>
    </div>
  )
})
