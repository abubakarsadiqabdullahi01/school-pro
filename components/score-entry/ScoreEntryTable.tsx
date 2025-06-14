"use client"

import { memo } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { StudentScoreRow } from "./StudentScoreRow"
import type { Student, ScoreEntry } from "./types"

interface AssessmentDataItem {
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

interface ScoreEntryTableProps {
  students: Student[]
  scores: Record<string, ScoreEntry>
  searchQuery: string
  onSearchChange: (query: string) => void
  onScoreChange: (studentId: string, field: keyof ScoreEntry, value: any) => void
  isLoading?: boolean
  assessmentData?: AssessmentDataItem[] // NEW: Enhanced assessment data
}

export const ScoreEntryTable = memo(function ScoreEntryTable({
  students,
  scores,
  searchQuery,
  onSearchChange,
  onScoreChange,
  isLoading = false,
  assessmentData = [],
}: ScoreEntryTableProps) {
  const filteredStudents = students.filter(
    (student) =>
      student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.admissionNo.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No students found for this class.</p>
      </div>
    )
  }

  // Create a map of assessment data for quick lookup
  const assessmentMap = new Map(assessmentData.map((item) => [item.studentId, item]))

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing {filteredStudents.length} of {students.length} students
          {assessmentData.length > 0 && (
            <span className="ml-2 text-blue-600">
              • {assessmentData.filter((a) => a.hasData).length} with existing data
            </span>
          )}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search students..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-gray-300 overflow-x-auto">
        <Table className="min-w-full bg-white">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[60px] text-center font-bold text-gray-800">S/N</TableHead>
              <TableHead className="w-[120px] text-center font-bold text-gray-800">Admission No.</TableHead>
              <TableHead className="font-bold text-gray-800">Name</TableHead>
              <TableHead className="w-[80px] text-center font-bold text-gray-800">
                Absent
                <div className="text-xs font-normal">✓</div>
              </TableHead>
              <TableHead className="w-[80px] text-center font-bold text-gray-800">
                Exempt
                <div className="text-xs font-normal">✓</div>
              </TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">
                1st C.A
                <div className="text-xs font-normal">(10 marks)</div>
              </TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">
                2nd C.A
                <div className="text-xs font-normal">(10 marks)</div>
              </TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">
                3rd C.A
                <div className="text-xs font-normal">(10 marks)</div>
              </TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">
                Exam
                <div className="text-xs font-normal">(70 marks)</div>
              </TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">Total</TableHead>
              <TableHead className="w-[80px] text-center font-bold text-gray-800">Grade</TableHead>
              <TableHead className="w-[100px] text-center font-bold text-gray-800">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student, index) => {
              const assessmentInfo = assessmentMap.get(student.id)
              return (
                <StudentScoreRow
                  key={student.id}
                  student={student}
                  score={scores[student.id]}
                  index={index}
                  onScoreChange={onScoreChange}
                  assessmentInfo={assessmentInfo} 
                />
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
})
