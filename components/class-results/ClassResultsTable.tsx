"use client"

import type React from "react"

import { memo } from "react"
import { ArrowUpDown } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

interface Subject {
  id: string
  name: string
  code: string
}

interface ClassResultsTableProps {
  results: StudentResult[]
  subjects: Subject[]
  showPositions: boolean
  onSort: (field: string) => void
  sortBy: string
  sortDirection: "asc" | "desc"
  isLoading: boolean
}

export const ClassResultsTable = memo(function ClassResultsTable({
  results,
  subjects,
  showPositions,
  onSort,
  sortBy,
  sortDirection,
  isLoading,
}: ClassResultsTableProps) {
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

  const SortableHeader = ({
    field,
    children,
    className = "",
  }: {
    field: string
    children: React.ReactNode
    className?: string
  }) => (
    <TableHead className={`cursor-pointer hover:bg-gray-100 ${className}`} onClick={() => onSort(field)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center">
              {children}
              <ArrowUpDown className="ml-1 h-4 w-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Sort by {children}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!results.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No results found. Ensure subject scores have been entered.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-gray-300 overflow-x-auto">
      <Table className="min-w-full bg-white">
        <TableHeader>
          <TableRow className="bg-gray-200">
            {showPositions && (
              <SortableHeader field="position" className="w-[80px] text-center font-bold text-gray-800">
                Position
              </SortableHeader>
            )}
            <SortableHeader field="admissionNo" className="w-[120px] text-center font-bold text-gray-800">
              Adm. No.
            </SortableHeader>
            <SortableHeader field="name" className="font-bold text-gray-800 min-w-[200px]">
              Student Name
            </SortableHeader>
            <TableHead className="w-[60px] text-center font-bold text-gray-800">Gender</TableHead>

            {/* Subject Columns */}
            {subjects.map((subject) => (
              <TableHead key={subject.id} className="w-[80px] text-center font-bold text-gray-800">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">{subject.code}</div>
                    </TooltipTrigger>
                    <TooltipContent>{subject.name}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
            ))}

            <SortableHeader field="totalScore" className="w-[80px] text-center font-bold text-gray-800">
              Total
            </SortableHeader>
            <SortableHeader field="averageScore" className="w-[80px] text-center font-bold text-gray-800">
              Average
            </SortableHeader>
            <TableHead className="w-[80px] text-center font-bold text-gray-800">Grade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <TableRow key={result.studentId} className="hover:bg-gray-50">
              {showPositions && (
                <TableCell className="text-center font-medium">
                  {result.position === 0 ? "-" : `${result.position}${getOrdinalSuffix(result.position)}`}
                </TableCell>
              )}
              <TableCell className="text-center font-mono">{result.admissionNo}</TableCell>
              <TableCell className="font-medium">{result.studentName}</TableCell>
              <TableCell className="text-center">
                {result.gender === "MALE" ? "M" : result.gender === "FEMALE" ? "F" : "-"}
              </TableCell>

              {/* Subject Scores */}
              {subjects.map((subject) => (
              <TableCell key={subject.id} className="text-center">
                {result.subjects[subject.id]?.score != null ? (
                  <div className="flex flex-col items-center">
                    <span className="font-medium">
                      {Number(result.subjects[subject.id].score).toFixed(0)}
                    </span>
                    {result.subjects[subject.id]?.grade && (
                      <Badge className={`text-xs mt-1 ${getGradeColor(result.subjects[subject.id]?.grade)}`}>
                        {result.subjects[subject.id]?.grade}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>

              ))}

              <TableCell className="text-center font-bold">
                {result.totalScore !== undefined && result.totalScore !== null 
                  ? result.totalScore.toFixed(0) 
                  : '-'}
              </TableCell>
              <TableCell className="text-center font-bold">
                {result.averageScore !== undefined && result.averageScore !== null 
                  ? result.averageScore.toFixed(1) 
                  : '-'}
              </TableCell>
              <TableCell className="text-center">
                <Badge className={getGradeColor(result.grade)}>{result.grade}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
})
