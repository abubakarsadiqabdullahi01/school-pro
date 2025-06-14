"use client"

import { memo } from "react"
import { Check, UserX, Shield, Clock, AlertCircle } from "lucide-react"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScoreInputCell } from "./ScoreInputCell"
import type { Student, ScoreEntry } from "./types"
import { format } from "date-fns"

interface AssessmentInfo {
  id: string | null
  studentId: string
  studentClassTermId: string
  studentName: string
  admissionNo: string
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
  totalScore: number | null
  grade: string | null
  remark: string | null
  isAbsent: boolean
  isExempt: boolean
  isPublished: boolean
  completionStatus: string
  hasData: boolean
  lastUpdated: Date | null
}

interface StudentScoreRowProps {
  student: Student
  score: ScoreEntry | undefined
  index: number
  onScoreChange: (studentId: string, field: keyof ScoreEntry, value: any) => void
  assessmentInfo?: AssessmentInfo // NEW: Enhanced assessment information
}

export const StudentScoreRow = memo(function StudentScoreRow({
  student,
  score,
  index,
  onScoreChange,
  assessmentInfo,
}: StudentScoreRowProps) {
  const getGradeBadgeColor = (grade: string | null) => {
    if (!grade) return "bg-gray-100 text-gray-800"

    switch (grade) {
      case "A":
      case "A1":
      case "A2":
        return "bg-green-100 text-green-800"
      case "B":
      case "B1":
      case "B2":
        return "bg-blue-100 text-blue-800"
      case "C":
      case "C1":
      case "C2":
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

  const getStatusBadge = () => {
    if (!score && !assessmentInfo) return null

    // Use assessment info if available for more accurate status
    if (assessmentInfo) {
      if (assessmentInfo.isAbsent) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                  <UserX className="h-3 w-3 mr-1" />
                  Absent
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Student marked as absent</p>
                {assessmentInfo.lastUpdated && (
                  <p className="text-xs">Last updated: {format(assessmentInfo.lastUpdated, "MMM dd, yyyy")}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }

      if (assessmentInfo.isExempt) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                  <Shield className="h-3 w-3 mr-1" />
                  Exempt
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Student exempt from assessment</p>
                {assessmentInfo.lastUpdated && (
                  <p className="text-xs">Last updated: {format(assessmentInfo.lastUpdated, "MMM dd, yyyy")}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }

      // Show completion status based on assessment data
      switch (assessmentInfo.completionStatus) {
        case "complete":
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                    <Check className="h-3 w-3 mr-1" />
                    Complete
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>All assessment scores entered</p>
                  {assessmentInfo.lastUpdated && (
                    <p className="text-xs">Last updated: {format(assessmentInfo.lastUpdated, "MMM dd, yyyy")}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        case "partial":
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Partial
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Some assessment scores missing</p>
                  {assessmentInfo.lastUpdated && (
                    <p className="text-xs">Last updated: {format(assessmentInfo.lastUpdated, "MMM dd, yyyy")}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        case "not_started":
        default:
          return (
            <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
              <AlertCircle className="h-3 w-3 mr-1" />
              Not Started
            </Badge>
          )
      }
    }

    // Fallback to score-based status if no assessment info
    if (score?.isAbsent) {
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
          <UserX className="h-3 w-3 mr-1" />
          Absent
        </Badge>
      )
    }

    if (score?.isExempt) {
      return (
        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
          <Shield className="h-3 w-3 mr-1" />
          Exempt
        </Badge>
      )
    }

    if (score?.isDirty) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
          Modified
        </Badge>
      )
    }

    if (score?.id) {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
          <Check className="h-3 w-3 mr-1" />
          Saved
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
        New
      </Badge>
    )
  }

  const isScoresDisabled = score?.isAbsent || score?.isExempt

  // Determine if row should be highlighted based on existing data
  const hasExistingData = assessmentInfo?.hasData || false
  const rowClassName = score?.isDirty
    ? "bg-yellow-50 border-l-4 border-l-yellow-400"
    : hasExistingData
      ? "bg-blue-50 hover:bg-blue-100"
      : "hover:bg-gray-50"

  return (
    <TableRow className={rowClassName}>
      <TableCell className="text-center font-medium">{index + 1}</TableCell>
      <TableCell className="text-center font-mono">{student.admissionNo}</TableCell>
      <TableCell className="font-medium">
        {student.fullName}
        {hasExistingData && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-2 text-blue-600 text-xs">●</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Has existing assessment data</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </TableCell>

      {/* Absent Checkbox */}
      <TableCell className="text-center p-2">
        <div className="flex items-center justify-center">
          <Checkbox
            checked={score?.isAbsent || false}
            onCheckedChange={(checked) => onScoreChange(student.id, "isAbsent", checked)}
            className="h-4 w-4"
          />
        </div>
      </TableCell>

      {/* Exempt Checkbox */}
      <TableCell className="text-center p-2">
        <div className="flex items-center justify-center">
          <Checkbox
            checked={score?.isExempt || false}
            onCheckedChange={(checked) => onScoreChange(student.id, "isExempt", checked)}
            className="h-4 w-4"
            disabled={score?.isAbsent}
          />
        </div>
      </TableCell>

      <TableCell className="text-center p-1">
        <ScoreInputCell
          value={score?.ca1 ?? (assessmentInfo?.ca1 || 0)}
          onChange={(value) => onScoreChange(student.id, "ca1", value)}
          min={0}
          max={10}
          step={0.5}
          disabled={isScoresDisabled}
          hasError={score?.hasError && score.errorMessage?.includes("ca1")}
          errorMessage={score?.errorMessage}
          placeholder="0"
          hasExistingData={assessmentInfo?.ca1 !== null && assessmentInfo?.ca1 !== undefined}
        />
      </TableCell>

      <TableCell className="text-center p-1">
        <ScoreInputCell
          value={score?.ca2 ?? (assessmentInfo?.ca2 || 0)}
          onChange={(value) => onScoreChange(student.id, "ca2", value)}
          min={0}
          max={10}
          step={0.5}
          disabled={isScoresDisabled}
          hasError={score?.hasError && score.errorMessage?.includes("ca2")}
          errorMessage={score?.errorMessage}
          placeholder="0"
          hasExistingData={assessmentInfo?.ca2 !== null && assessmentInfo?.ca2 !== undefined}
        />
      </TableCell>

      <TableCell className="text-center p-1">
        <ScoreInputCell
          value={score?.ca3 ?? (assessmentInfo?.ca3 || 0)}
          onChange={(value) => onScoreChange(student.id, "ca3", value)}
          min={0}
          max={10}
          step={0.5}
          disabled={isScoresDisabled}
          hasError={score?.hasError && score.errorMessage?.includes("ca3")}
          errorMessage={score?.errorMessage}
          placeholder="0"
          hasExistingData={assessmentInfo?.ca3 !== null && assessmentInfo?.ca3 !== undefined}
        />
      </TableCell>

      <TableCell className="text-center p-1">
        <ScoreInputCell
          value={score?.exam ?? (assessmentInfo?.exam || 0)}
          onChange={(value) => onScoreChange(student.id, "exam", value)}
          min={0}
          max={70}
          step={0.5}
          disabled={isScoresDisabled}
          hasError={score?.hasError && score.errorMessage?.includes("exam")}
          errorMessage={score?.errorMessage}
          placeholder="0"
          hasExistingData={assessmentInfo?.exam !== null && assessmentInfo?.exam !== undefined}
        />
      </TableCell>

      <TableCell className="text-center font-bold">
        {isScoresDisabled ? (
          <span className="text-gray-400">-</span>
        ) : (
          <span>
            {score?.totalScore !== null && score?.totalScore !== undefined
              ? score.totalScore.toFixed(1)
              : assessmentInfo?.totalScore !== null && assessmentInfo?.totalScore !== undefined
                ? assessmentInfo.totalScore.toFixed(1)
                : "0.0"}
          </span>
        )}
      </TableCell>

      <TableCell className="text-center">
        {isScoresDisabled ? (
          <span className="text-gray-400">-</span>
        ) : score?.grade || assessmentInfo?.grade ? (
          <Badge className={getGradeBadgeColor((score?.grade ?? assessmentInfo?.grade) ?? null)}>
            {score?.grade || assessmentInfo?.grade}
          </Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-800">F</Badge>
        )}
      </TableCell>

      <TableCell className="text-center">{getStatusBadge()}</TableCell>
    </TableRow>
  )
})
