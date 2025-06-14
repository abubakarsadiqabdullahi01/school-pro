"use client"

import { memo } from "react"
import { Users, Trophy, TrendingUp, Target, BarChart3, Award } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface SummaryStats {
  totalStudents: number
  averageScore: number
  passRate: number
  highestScore: number
  lowestScore: number
  topStudent: any
  gradeDistribution: Record<string, number>
  subjectAverages: Record<string, any>
}

interface ClassResultsSummaryCardsProps {
  summaryStats: SummaryStats
  gradingSystem: any
  isLoading: boolean
}

export const ClassResultsSummaryCards = memo(function ClassResultsSummaryCards({
  summaryStats,
  gradingSystem,
  isLoading,
}: ClassResultsSummaryCardsProps) {
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

  const getGradeColor = (grade: string) => {
    const firstChar = grade.charAt(0).toUpperCase()
    switch (firstChar) {
      case "A":
        return "bg-green-100 text-green-800"
      case "B":
        return "bg-blue-100 text-blue-800"
      case "C":
        return "bg-yellow-100 text-yellow-800"
      case "D":
      case "E":
        return "bg-orange-100 text-orange-800"
      case "F":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPerformanceColor = (score: number) => {
    if (score >= 70) return "text-green-600"
    if (score >= 60) return "text-blue-600"
    if (score >= 50) return "text-yellow-600"
    if (score >= 40) return "text-orange-600"
    return "text-red-600"
  }

  return (
    <div className="space-y-6">
      {/* Main Summary Cards */}
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
              <TrendingUp className="h-4 w-4" />
              Class Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getPerformanceColor(summaryStats.averageScore)}`}>
              {summaryStats.averageScore.toFixed(1)}%
            </div>
            <Progress value={summaryStats.averageScore} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Range: {summaryStats.lowestScore.toFixed(1)} - {summaryStats.highestScore.toFixed(1)}
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((summaryStats.passRate / 100) * summaryStats.totalStudents)} of {summaryStats.totalStudents}{" "}
              students passed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Top Student
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{summaryStats.topStudent?.studentName || "N/A"}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-gold-100 text-gold-800">
                1st Position
              </Badge>
              {summaryStats.topStudent && (
                <span className="text-sm text-muted-foreground">
                  {summaryStats.topStudent.averageScore.toFixed(1)}%
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Grade Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Object.entries(summaryStats.gradeDistribution)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([grade, count]) => (
                <div key={grade} className="text-center">
                  <Badge className={`${getGradeColor(grade)} mb-2`}>Grade {grade}</Badge>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground">
                    {summaryStats.totalStudents > 0 ? ((count / summaryStats.totalStudents) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Subject Performance Overview */}
      {Object.keys(summaryStats.subjectAverages).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Award className="h-5 w-5" />
              Subject Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.values(summaryStats.subjectAverages)
                .sort((a: any, b: any) => b.average - a.average)
                .slice(0, 6) // Show top 6 subjects
                .map((subject: any) => (
                  <div key={subject.name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{subject.code}</span>
                      <span className={`text-sm font-bold ${getPerformanceColor(subject.average)}`}>
                        {subject.average.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={subject.average} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{subject.name}</span>
                      <span>Pass: {subject.passRate.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
})
