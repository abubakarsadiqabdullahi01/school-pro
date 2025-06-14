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
  gender: string
  subjects: Record<string, { score: number | null; grade: string | null }>
  totalScore: number
  averageScore: number
  grade: string
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
    if (!grade) return "bg-gray-100 text-gray-800"

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
        <p className="text-gray-500">No students found for this class.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-gray-300 overflow-x-auto">
      <Table className="min-w-full bg-white">
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-[50px] text-center font-bold text-gray-800">
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
            <TableHead className="w-[60px] text-center font-bold text-gray-800">S/N</TableHead>
            <TableHead className="w-[120px] text-center font-bold text-gray-800">Admission No.</TableHead>
            <TableHead className="font-bold text-gray-800">Student Name</TableHead>
            <TableHead className="w-[80px] text-center font-bold text-gray-800">Position</TableHead>
            <TableHead className="w-[100px] text-center font-bold text-gray-800">Average</TableHead>
            <TableHead className="w-[80px] text-center font-bold text-gray-800">Grade</TableHead>
            <TableHead className="w-[100px] text-center font-bold text-gray-800">Status</TableHead>
            <TableHead className="w-[200px] text-center font-bold text-gray-800">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => {
            const studentResult = results.find((r) => r.studentId === student.id)
            const hasResult = studentResult && studentResult.averageScore > 0
            const isSelected = selectedStudents.includes(student.id)

            return (
              <TableRow key={student.id} className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50" : ""}`}>
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
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      {studentResult.position}
                      {getOrdinalSuffix(studentResult.position)}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center font-bold">
                  {hasResult ? (
                    <span className={studentResult.averageScore >= 40 ? "text-green-600" : "text-red-600"}>
                      {studentResult.averageScore.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {hasResult ? (
                    <Badge className={getGradeColor(studentResult.grade)}>{studentResult.grade}</Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {hasResult ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
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
