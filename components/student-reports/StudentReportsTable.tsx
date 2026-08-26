"use client"

import { memo } from "react"
import { Download, Eye, FileText, Loader2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Student {
  id: string
  studentClassTermId: string
  admissionNo: string
  fullName: string
}

interface StudentResult {
  studentId: string
  studentName: string
  admissionNo: string
  gender: string | null
  subjects: Record<string, { score: number | null; grade: string | null }>
  totalScore: number
  averageScore: number
  /** Null when no grade band covers the average — rendered as an em dash, not as a fail. */
  grade: string | null
  position: number
}

interface StudentReportsTableProps {
  students: Student[]
  results: StudentResult[]
  selectedStudents: string[]
  onStudentSelect: (studentId: string, selected: boolean) => void
  onGenerateReport: (studentId: string, action: "save" | "preview" | "print") => void
  canGenerateReports: boolean
  isGenerating: boolean
  isLoading: boolean
}

export const StudentReportsTable = memo(function StudentReportsTable({
  students,
  results,
  selectedStudents,
  onStudentSelect,
  onGenerateReport,
  canGenerateReports,
  isGenerating,
  isLoading,
}: StudentReportsTableProps) {
  const getGradeColor = (grade: string | null) => {
    if (!grade) return "bg-muted text-foreground"

    const firstChar = grade.charAt(0).toUpperCase()
    switch (firstChar) {
      case "A":
        return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "B":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      case "C":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      case "D":
      case "E":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400"
      case "F":
        return "bg-red-500/10 text-red-700 dark:text-red-400"
      default:
        return "bg-muted text-foreground"
    }
  }

  const getOrdinalSuffix = (n: number): string => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!students.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No students found for this class.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table className="min-w-full bg-card">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[50px] text-center font-bold text-foreground">
              <Checkbox
                checked={selectedStudents.length === students.length && students.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    students.forEach((student) => {
                      if (!selectedStudents.includes(student.id)) {
                        onStudentSelect(student.id, true)
                      }
                    })
                  } else {
                    selectedStudents.forEach((studentId) => {
                      onStudentSelect(studentId, false)
                    })
                  }
                }}
                className="h-4 w-4"
              />
            </TableHead>
            <TableHead className="w-[60px] text-center font-bold text-foreground">S/N</TableHead>
            <TableHead className="w-[120px] text-center font-bold text-foreground">Admission No.</TableHead>
            <TableHead className="font-bold text-foreground">Student Name</TableHead>
            <TableHead className="w-[80px] text-center font-bold text-foreground">Position</TableHead>
            <TableHead className="w-[100px] text-center font-bold text-foreground">Average</TableHead>
            <TableHead className="w-[80px] text-center font-bold text-foreground">Grade</TableHead>
            <TableHead className="w-[100px] text-center font-bold text-foreground">Status</TableHead>
            <TableHead className="w-[200px] text-center font-bold text-foreground">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => {
            const studentResult = results.find((r) => r.studentId === student.id)
            const hasResult = studentResult && studentResult.averageScore > 0
            const isSelected = selectedStudents.includes(student.id)

            return (
              <TableRow key={student.id} className={`hover:bg-muted/50 ${isSelected ? "bg-blue-50" : ""}`}>
                <TableCell className="text-center">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onStudentSelect(student.id, !!checked)}
                    className="h-4 w-4"
                    disabled={!hasResult}
                  />
                </TableCell>
                <TableCell className="text-center font-medium">{index + 1}</TableCell>
                <TableCell className="text-center font-mono">{student.admissionNo}</TableCell>
                <TableCell className="font-medium">{student.fullName}</TableCell>
                <TableCell className="text-center">
                  {hasResult && studentResult.position > 0 ? (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
                      {studentResult.position}
                      {getOrdinalSuffix(studentResult.position)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center font-bold">
                  {hasResult ? (
                    <span className={studentResult.averageScore >= 40 ? "text-green-600" : "text-red-600"}>
                      {studentResult.averageScore.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {hasResult ? (
                    <Badge className={getGradeColor(studentResult.grade)}>{studentResult.grade ?? "—"}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {hasResult ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-300">
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-300">
                      No Results
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateReport(student.id, "preview")}
                            disabled={!canGenerateReports || !hasResult || isGenerating}
                            className="h-8 w-8 p-0"
                          >
                            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview Report</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateReport(student.id, "save")}
                            disabled={!canGenerateReports || !hasResult || isGenerating}
                            className="h-8 w-8 p-0"
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download Report</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateReport(student.id, "print")}
                            disabled={!canGenerateReports || !hasResult || isGenerating}
                            className="h-8 w-8 p-0"
                          >
                            {isGenerating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Print Report</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
})
