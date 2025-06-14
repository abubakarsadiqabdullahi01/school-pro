"use client"

import { memo } from "react"
import { Users, CheckCircle, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TransitionSummaryCardsProps {
  statistics: {
    totalStudents: number
    eligibleStudents: number
    ineligibleStudents: number
    averageClassScore: number
  }
  classInfo: {
    className: string
    classLevel: string
    termName: string
  }
}

export const TransitionSummaryCards = memo(function TransitionSummaryCards({
  statistics,
  classInfo,
}: TransitionSummaryCardsProps) {
  // Safely calculate eligibility rate
  const eligibilityRate =
    statistics?.totalStudents > 0 ? (statistics.eligibleStudents / statistics.totalStudents) * 100 : 0

  // Safely get class info with fallbacks
  const className = classInfo?.className || "Unknown Class"
  const classLevel = classInfo?.classLevel || "Unknown Level"
  const termName = classInfo?.termName || "Unknown Term"

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Class Information</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold">{className}</div>
          <p className="text-xs text-muted-foreground">
            {classLevel} - {termName}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statistics?.totalStudents || 0}</div>
          <p className="text-xs text-muted-foreground">Average: {(statistics?.averageClassScore || 0).toFixed(1)}%</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Eligible Students</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{statistics?.eligibleStudents || 0}</div>
          <p className="text-xs text-muted-foreground">{eligibilityRate.toFixed(1)}% eligible</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Not Eligible</CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{statistics?.ineligibleStudents || 0}</div>
          <p className="text-xs text-muted-foreground">Need improvement</p>
        </CardContent>
      </Card>
    </div>
  )
})
