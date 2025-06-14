"use client"

import { memo, useState, useCallback } from "react"
import { Loader2, CheckCircle, XCircle, Users, ArrowRight } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { executeStudentTransitions } from "@/app/actions/student-transitions"
import { toast } from "sonner"

interface StudentTransitionTableProps {
  students: any[]
  isLoading: boolean
  fromClassTermId: string
  toClassTermId: string
  transitionType: string
  onTransitionComplete: () => void
  classInfo?: {
    className: string
    classLevel: string
    termName: string
  }
}

export const StudentTransitionTable = memo(function StudentTransitionTable({
  students,
  isLoading,
  fromClassTermId,
  toClassTermId,
  transitionType,
  onTransitionComplete,
  classInfo,
}: StudentTransitionTableProps) {
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [isExecuting, setIsExecuting] = useState(false)

  // Handle individual student selection
  const handleStudentSelect = useCallback((studentId: string, checked: boolean) => {
    setSelectedStudents((prev) => {
      if (checked) {
        return [...prev, studentId]
      } else {
        return prev.filter((id) => id !== studentId)
      }
    })
  }, [])

  // Handle select all eligible students
  const handleSelectAllEligible = useCallback(() => {
    const eligibleStudents = students.filter((student) => student.isEligible)
    const eligibleIds = eligibleStudents.map((student) => student.studentId)

    // If all eligible students are already selected, deselect them
    const allEligibleSelected = eligibleIds.every((id) => selectedStudents.includes(id))

    if (allEligibleSelected) {
      setSelectedStudents((prev) => prev.filter((id) => !eligibleIds.includes(id)))
    } else {
      setSelectedStudents((prev) => {
        const newSelection = [...prev]
        eligibleIds.forEach((id) => {
          if (!newSelection.includes(id)) {
            newSelection.push(id)
          }
        })
        return newSelection
      })
    }
  }, [students, selectedStudents])

  // Handle transition execution
  const handleExecuteTransition = useCallback(async () => {
    if (!selectedStudents.length) {
      toast.info("No Students Selected", {
        description: "Please select at least one student to transition.",
      })
      return
    }

    if (!toClassTermId) {
      toast.info("No Destination Selected", {
        description: "Please select a destination class before executing the transition.",
      })
      return
    }

    setIsExecuting(true)
    try {
      const result = await executeStudentTransitions({
        fromClassTermId,
        toClassTermId,
        studentIds: selectedStudents,
        transitionType: transitionType as "PROMOTION" | "TRANSFER" | "WITHDRAWAL",
        notes: `Bulk transition of ${selectedStudents.length} students`,
      })

      if (result.success) {
        toast.success("Transition Successful", {
          description: result.data.message,
        })
        setSelectedStudents([]) // Clear selection after successful transition
        onTransitionComplete() // Refresh data
      } else {
        toast.error("Transition Failed", {
          description: result.error || "Failed to execute transition",
        })
      }
    } catch (error) {
      console.error("Error executing transition:", error)
      toast.error("Error", {
        description: "An unexpected error occurred during transition",
      })
    } finally {
      setIsExecuting(false)
    }
  }, [selectedStudents, toClassTermId, fromClassTermId, transitionType, onTransitionComplete])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Students...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!fromClassTermId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select Source Class</CardTitle>
          <CardDescription>Please select a source class to view students available for transition.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 flex-col items-center justify-center space-y-2 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-lg font-medium">No Source Class Selected</p>
            <p className="text-sm text-muted-foreground">
              Choose a source class from the dropdown above to see students.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!students || students.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Students Found</CardTitle>
          <CardDescription>
            {classInfo?.className
              ? `No students found in ${classInfo.className} for ${classInfo.termName || "this term"}.`
              : "No students found in the selected class."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 flex-col items-center justify-center space-y-2 text-center">
            <XCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-lg font-medium">No Students Available</p>
            <p className="text-sm text-muted-foreground">
              There are no students enrolled in this class for transition.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getGradeBadgeVariant = (grade: string) => {
    if (!grade) return "bg-gray-500"
    const firstChar = grade.charAt(0).toUpperCase()
    switch (firstChar) {
      case "A":
        return "bg-green-500"
      case "B":
        return "bg-blue-500"
      case "C":
        return "bg-yellow-500"
      case "D":
        return "bg-orange-500"
      case "E":
      case "F":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const eligibleStudents = students.filter((student) => student.isEligible)
  const allEligibleSelected =
    eligibleStudents.length > 0 && eligibleStudents.every((student) => selectedStudents.includes(student.studentId))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Students Available for Transition</CardTitle>
        <CardDescription>
          {classInfo?.className && classInfo?.termName
            ? `Students in ${classInfo.className} - ${classInfo.termName}`
            : "Select students to transition"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Select</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Admission No.</TableHead>
                <TableHead className="text-center">Position</TableHead>
                <TableHead className="text-center">Average</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Subjects Passed</TableHead>
                <TableHead className="text-center">Eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const isSelected = selectedStudents.includes(student.studentId)
                return (
                  <TableRow key={student.studentId || student.id} className={!student.isEligible ? "bg-muted/30" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleStudentSelect(student.studentId, !!checked)}
                        disabled={!student.isEligible}
                        aria-label={`Select ${student.studentName || "student"}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{student.studentName || "Unknown Student"}</TableCell>
                    <TableCell>{student.admissionNo || "-"}</TableCell>
                    <TableCell className="text-center">{student.position || "-"}</TableCell>
                    <TableCell className="text-center">
                      {student.averageScore ? student.averageScore.toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getGradeBadgeVariant(student.grade)} variant="secondary">
                        {student.grade || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {student.subjectsPassed || 0}/{student.subjectsOffered || 0} (
                      {student.passRate ? student.passRate.toFixed(0) : 0}%)
                    </TableCell>
                    <TableCell className="text-center">
                      {student.isEligible ? (
                        <Badge className="bg-green-500" variant="secondary">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Eligible
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500" variant="secondary">
                          <XCircle className="mr-1 h-3 w-3" />
                          Not Eligible
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedStudents.length} of {eligibleStudents.length} eligible students selected
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllEligible}
              disabled={eligibleStudents.length === 0}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {allEligibleSelected ? "Deselect All" : "Select All Eligible"}
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteTransition}
              disabled={!toClassTermId || selectedStudents.length === 0 || isExecuting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Execute Transition ({selectedStudents.length})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Show selected students info */}
        {selectedStudents.length > 0 && (
          <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
            <h4 className="font-medium text-blue-900 dark:text-blue-100">
              {selectedStudents.length} student{selectedStudents.length > 1 ? "s" : ""} selected for transition
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {!toClassTermId
                ? "Please select a destination class to proceed with the transition."
                : "Click 'Execute Transition' to move the selected students to the destination class."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
