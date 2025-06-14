"use client"

import { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Users, CheckCircle, Clock, UserX, Shield, AlertTriangle } from "lucide-react"

interface AssessmentStatusCardProps {
  statistics: {
    totalStudents: number
    studentsWithData: number
    completeAssessments: number
    partialAssessments: number
    absentStudents: number
    exemptStudents: number
    studentsWithoutData: number
    completionPercentage: number
  }
  classInfo?: {
    className: string
    termName: string
  }
  subjectName?: string
  subjectCode?: string
  isLoading?: boolean
}

export const AssessmentStatusCard = memo(function AssessmentStatusCard({
  statistics,
  classInfo,
  subjectName,
  subjectCode,
  isLoading = false,
}: AssessmentStatusCardProps) {
  if (isLoading) {
    return (
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Assessment Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600"
    if (percentage >= 70) return "text-blue-600"
    if (percentage >= 50) return "text-yellow-600"
    return "text-red-600"
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-500"
    if (percentage >= 70) return "bg-blue-500"
    if (percentage >= 50) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <Card className="border shadow-md">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Assessment Status Overview
        </CardTitle>
        {classInfo && (
          <p className="text-sm text-muted-foreground">
            {classInfo.className} • {classInfo.termName} • {subjectName} ({subjectCode})
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Completion</span>
            <span className={`text-sm font-bold ${getStatusColor(statistics.completionPercentage)}`}>
              {statistics.completionPercentage}%
            </span>
          </div>
          <Progress
            value={statistics.completionPercentage}
            className="h-3"
            style={{
              background: `linear-gradient(to right, ${getProgressColor(statistics.completionPercentage)} 0%, ${getProgressColor(statistics.completionPercentage)} ${statistics.completionPercentage}%, #e5e7eb ${statistics.completionPercentage}%, #e5e7eb 100%)`,
            }}
          />
          <p className="text-xs text-muted-foreground">
            {statistics.completeAssessments + statistics.absentStudents + statistics.exemptStudents} of{" "}
            {statistics.totalStudents} students processed
          </p>
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-green-700">{statistics.completeAssessments}</div>
            <div className="text-xs text-green-600">Complete</div>
          </div>

          <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-yellow-700">{statistics.partialAssessments}</div>
            <div className="text-xs text-yellow-600">Partial</div>
          </div>

          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <UserX className="h-6 w-6 text-red-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-red-700">{statistics.absentStudents}</div>
            <div className="text-xs text-red-600">Absent</div>
          </div>

          <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
            <Shield className="h-6 w-6 text-purple-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-purple-700">{statistics.exemptStudents}</div>
            <div className="text-xs text-purple-600">Exempt</div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Badge variant="outline" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            {statistics.totalStudents} Total Students
          </Badge>

          {statistics.studentsWithoutData > 0 && (
            <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {statistics.studentsWithoutData} Not Started
            </Badge>
          )}

          {statistics.studentsWithData > 0 && (
            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700">
              {statistics.studentsWithData} Have Data
            </Badge>
          )}
        </div>

        {/* Status Messages */}
        {statistics.completionPercentage === 100 ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700 font-medium">
              All assessments completed! Ready for report generation.
            </span>
          </div>
        ) : statistics.studentsWithoutData > 0 ? (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-700">
              {statistics.studentsWithoutData} student{statistics.studentsWithoutData > 1 ? "s" : ""} still need
              {statistics.studentsWithoutData === 1 ? "s" : ""} assessment data.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700">
              Some assessments are partially complete. Review and complete missing scores.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
