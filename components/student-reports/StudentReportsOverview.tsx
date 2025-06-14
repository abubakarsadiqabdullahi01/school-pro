"use client"

import { useState, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Download, Loader2, Search, Eye, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { StudentReportsTable } from "./StudentReportsTable"
import { StudentReportsSummaryCards } from "./StudentReportsSummaryCards"

import {
  getClassesForTerm,
  getStudentsForClassTerm,
  getClassTermSubjects,
  getClassTermResults,
  getGradingSystem,
} from "@/app/actions/compiler"
import { getStudentReportData, getClassStatistics } from "@/app/actions/student-reports"
import { exportStudentReportPDF } from "@/lib/pdf/student-report-card-generator"
import type { ClassLevel } from "@prisma/client"

interface StudentReportsOverviewProps {
  schoolId: string
  schoolName: string
  schoolCode: string
  schoolAddress: string
  schoolPhone: string
  schoolEmail: string
  schoolLogo: string | null
  terms: {
    id: string
    name: string
    isCurrent: boolean
    session: {
      id: string
      name: string
      startDate: Date
      endDate: Date
    }
  }[]
  currentTermId: string | undefined
  classLevels: ClassLevel[]
}

interface FormState {
  termId: string
  level: string
  classId: string
  searchQuery: string
  selectedStudents: string[]
}

export function StudentReportsOverview({
  schoolId,
  schoolName,
  schoolCode,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  schoolLogo,
  terms,
  currentTermId,
  classLevels,
}: StudentReportsOverviewProps) {
  const [form, setForm] = useState<FormState>({
    termId: currentTermId || "",
    level: "",
    classId: "",
    searchQuery: "",
    selectedStudents: [],
  })

  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)

  // Fetch grading system
  const { data: gradingSystem, isLoading: isLoadingGrading } = useQuery({
    queryKey: ["gradingSystem", schoolId],
    queryFn: async () => {
      const result = await getGradingSystem(schoolId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
  })

  // Fetch classes
  const { data: classes = [], isLoading: isLoadingClasses } = useQuery({
    queryKey: ["classes", form.termId, form.level],
    queryFn: async () => {
      if (!form.termId || !form.level) return []
      const result = await getClassesForTerm(form.termId, form.level as ClassLevel)
      return result.success ? result.data : []
    },
    enabled: !!form.termId && !!form.level,
  })

  // Get classTermId from selected class
  const classTermId = useMemo(() => {
    if (!form.classId || classes.length === 0) return ""
    const selectedClass = classes.find((c) => c.id === form.classId)
    return selectedClass?.classTermId || ""
  }, [form.classId, classes])

  // Fetch students
  const { data: students = [], isLoading: isLoadingStudents } = useQuery({
    queryKey: ["students", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getStudentsForClassTerm(classTermId)
      return result.success ? result.data : []
    },
    enabled: !!classTermId,
  })

  // Fetch subjects
  const { data: subjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ["subjects", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getClassTermSubjects(classTermId)
      return result.success ? result.data : []
    },
    enabled: !!classTermId,
  })

  // Fetch results
  const { data: results = [], isLoading: isLoadingResults } = useQuery({
    queryKey: ["results", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getClassTermResults(classTermId)
      return result.success ? result.data : []
    },
    enabled: !!classTermId,
  })

  // Fetch class statistics
  const { data: classStatistics, isLoading: isLoadingStats } = useQuery({
    queryKey: ["classStatistics", classTermId],
    queryFn: async () => {
      if (!classTermId) return null
      const result = await getClassStatistics(classTermId)
      return result.success ? result.data : null
    },
    enabled: !!classTermId,
  })

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!results.length) {
      return {
        totalStudents: 0,
        studentsWithResults: 0,
        averageScore: 0,
        passRate: 0,
        reportsGenerated: 0,
      }
    }

    const totalStudents = students.length
    const studentsWithResults = results.filter((r) => r.averageScore > 0).length
    const totalScores = results.map((r) => r.averageScore).filter((score) => score > 0)
    const averageScore = totalScores.length > 0 ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length : 0
    const passCount = results.filter((r) => r.averageScore >= (gradingSystem?.passMark || 40)).length
    const passRate = studentsWithResults > 0 ? (passCount / studentsWithResults) * 100 : 0

    return {
      totalStudents,
      studentsWithResults,
      averageScore,
      passRate,
      reportsGenerated: 0,
    }
  }, [results, students, gradingSystem])

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(form.searchQuery.toLowerCase()) ||
        student.admissionNo.toLowerCase().includes(form.searchQuery.toLowerCase()),
    )
  }, [students, form.searchQuery])

  // Handle form changes
  const handleTermChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, termId: value, level: "", classId: "", selectedStudents: [] }))
  }, [])

  const handleLevelChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, level: value, classId: "", selectedStudents: [] }))
  }, [])

  const handleClassChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, classId: value, selectedStudents: [] }))
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, searchQuery: value }))
  }, [])

  const handleStudentSelect = useCallback((studentId: string, selected: boolean) => {
    setForm((prev) => ({
      ...prev,
      selectedStudents: selected
        ? [...prev.selectedStudents, studentId]
        : prev.selectedStudents.filter((id) => id !== studentId),
    }))
  }, [])

  const handleSelectAll = useCallback(() => {
    const allStudentIds = filteredStudents.map((s) => s.id)
    setForm((prev) => ({
      ...prev,
      selectedStudents: prev.selectedStudents.length === allStudentIds.length ? [] : allStudentIds,
    }))
  }, [filteredStudents])

  // Generate single student report
  const generateSingleReport = useCallback(
    async (studentId: string, action: "save" | "preview" | "print") => {
      if (!gradingSystem || !subjects.length) {
        toast.error("Missing required data for report generation")
        return
      }

      setIsGenerating(true)
      try {
        const result = await getStudentReportData(studentId, form.termId)
        if (!result.success || !result.data) {
          throw new Error(result.error || "Failed to fetch student data")
        }

        const selectedTerm = terms.find((t) => t.id === form.termId)
        const selectedClass = classes.find((c) => c.id === form.classId)

        if (!selectedTerm || !selectedClass) {
          throw new Error("Term or class information missing")
        }

        // Calculate next term start date (assuming terms are consecutive)
        const termEndDate = selectedTerm.session.endDate
        const nextTermStartDate = new Date(termEndDate)
        nextTermStartDate.setDate(nextTermStartDate.getDate() + 30) // Approximate next term start

        await exportStudentReportPDF({
          student: result.data,
          schoolInfo: {
            schoolName,
            schoolCode,
            schoolAddress,
            schoolPhone,
            schoolEmail,
            schoolLogo,
          },
          classInfo: {
            className: selectedClass.name,
            termName: selectedTerm.name,
            sessionName: selectedTerm.session.name,
            teacherName: selectedClass.teacherName || "Not Assigned",
            termEndDate: termEndDate.toISOString(),
            nextTermStartDate: nextTermStartDate.toISOString(),
          },
          subjects,
          classStatistics,
          gradingSystem,
          action,
        })

        toast.success(
          `Report ${action === "save" ? "downloaded" : action === "preview" ? "previewed" : "printed"} successfully`,
        )
      } catch (error) {
        console.error("Error generating report:", error)
        toast.error(`Failed to generate report: ${error instanceof Error ? error.message : "Unknown error"}`)
      } finally {
        setIsGenerating(false)
      }
    },
    [
      gradingSystem,
      subjects,
      form.termId,
      terms,
      classes,
      form.classId,
      schoolName,
      schoolCode,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      schoolLogo,
      classStatistics,
    ],
  )

  // Generate multiple reports
  const generateMultipleReports = useCallback(
    async (action: "merge-preview" | "merge-save") => {
      if (!form.selectedStudents.length) {
        toast.error("Please select students to generate reports")
        return
      }

      if (!gradingSystem || !subjects.length) {
        toast.error("Missing required data for report generation")
        return
      }

      setIsGenerating(true)
      setGenerationProgress(0)

      try {
        const selectedTerm = terms.find((t) => t.id === form.termId)
        const selectedClass = classes.find((c) => c.id === form.classId)

        if (!selectedTerm || !selectedClass) {
          throw new Error("Term or class information missing")
        }

        // Calculate next term start date
        const termEndDate = selectedTerm.session.endDate
        const nextTermStartDate = new Date(termEndDate)
        nextTermStartDate.setDate(nextTermStartDate.getDate() + 30)

        const allStudentData = []

        for (let i = 0; i < form.selectedStudents.length; i++) {
          const studentId = form.selectedStudents[i]
          const result = await getStudentReportData(studentId, form.termId)

          if (result.success && result.data) {
            allStudentData.push(result.data)
          }

          setGenerationProgress(((i + 1) / form.selectedStudents.length) * 100)
        }

        if (allStudentData.length === 0) {
          throw new Error("No valid student data found")
        }

        // Use the first student for the main report, pass all students for merged generation
        await exportStudentReportPDF({
          student: allStudentData[0],
          schoolInfo: {
            schoolName,
            schoolCode,
            schoolAddress,
            schoolPhone,
            schoolEmail,
            schoolLogo,
          },
          classInfo: {
            className: selectedClass.name,
            termName: selectedTerm.name,
            sessionName: selectedTerm.session.name,
            teacherName: selectedClass.teacherName || "Not Assigned",
            termEndDate: termEndDate.toISOString(),
            nextTermStartDate: nextTermStartDate.toISOString(),
          },
          subjects,
          classStatistics,
          gradingSystem,
          action,
          allStudents: allStudentData,
        })

        toast.success(`Generated ${allStudentData.length} report${allStudentData.length > 1 ? "s" : ""} successfully`)
      } catch (error) {
        console.error("Error generating reports:", error)
        toast.error(`Failed to generate reports: ${error instanceof Error ? error.message : "Unknown error"}`)
      } finally {
        setIsGenerating(false)
        setGenerationProgress(0)
      }
    },
    [
      form.selectedStudents,
      form.termId,
      gradingSystem,
      subjects,
      terms,
      classes,
      form.classId,
      schoolName,
      schoolCode,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      schoolLogo,
      classStatistics,
    ],
  )

  const selectedTerm = terms.find((t) => t.id === form.termId)
  const selectedClass = classes.find((c) => c.id === form.classId)

  const canGenerateReports = !!(gradingSystem && subjects.length && results.length && selectedTerm && selectedClass)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Selection Controls */}
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            Student Report Cards
            {isLoadingGrading ? (
              <span className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading grading system...
              </span>
            ) : gradingSystem ? (
              <Badge variant="secondary">Grading: {gradingSystem.name}</Badge>
            ) : (
              <Badge variant="destructive">No Grading System</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="term" className="text-sm font-medium">
                Academic Term
              </Label>
              <Select value={form.termId} onValueChange={handleTermChange}>
                <SelectTrigger id="term">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.session.name} - {term.name}
                      {term.isCurrent && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level" className="text-sm font-medium">
                Class Level
              </Label>
              <Select value={form.level} onValueChange={handleLevelChange}>
                <SelectTrigger id="level">
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {classLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class" className="text-sm font-medium">
                Class
              </Label>
              <Select
                value={form.classId}
                onValueChange={handleClassChange}
                disabled={!form.termId || !form.level || isLoadingClasses}
              >
                <SelectTrigger id="class">
                  {isLoadingClasses ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select a class" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                      {cls.teacherName && ` (${cls.teacherName})`}
                    </SelectItem>
                  ))}
                  {classes.length === 0 && (
                    <SelectItem value="none" disabled>
                      No classes available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check for missing data */}
      {!isLoadingGrading && !gradingSystem ? (
        <Alert variant="destructive">
          <AlertTitle>No Grading System Found</AlertTitle>
          <AlertDescription>
            A grading system is required to generate report cards. Please create a grading system in the admin settings.
          </AlertDescription>
        </Alert>
      ) : classTermId ? (
        <>
          {/* Summary Cards */}
          <StudentReportsSummaryCards
            summaryStats={summaryStats}
            gradingSystem={gradingSystem}
            isLoading={isLoadingResults || isLoadingStats}
          />

          {/* Main Content */}
          <Card className="border shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-2xl font-bold">Student Reports</CardTitle>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateMultipleReports("merge-preview")}
                        disabled={!canGenerateReports || !form.selectedStudents.length || isGenerating}
                      >
                        {isGenerating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="mr-2 h-4 w-4" />
                        )}
                        Preview Selected
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview reports for selected students</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateMultipleReports("merge-save")}
                        disabled={!canGenerateReports || !form.selectedStudents.length || isGenerating}
                      >
                        {isGenerating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Download Selected
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download reports for selected students</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Search and Selection Controls */}
              <div className="mb-6 space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search students..."
                      className="pl-8"
                      value={form.searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={!filteredStudents.length}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {form.selectedStudents.length === filteredStudents.length ? "Deselect All" : "Select All"}
                    </Button>

                    <Badge variant="secondary">
                      {form.selectedStudents.length} of {filteredStudents.length} selected
                    </Badge>
                  </div>
                </div>

                {/* Class Info Header */}
                <div className="text-center space-y-2">
                  <h1 className="text-3xl font-bold text-gray-800">{schoolName.toUpperCase()}</h1>
                  <p className="text-base text-gray-600">{schoolAddress}</p>
                  <p className="text-base text-gray-600">
                    GSM: {schoolPhone} | Email: {schoolEmail}
                  </p>
                  <h2 className="text-xl font-semibold text-gray-700">Student Report Cards</h2>
                  <hr className="border-t border-gray-400 my-2 w-3/4 mx-auto" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-lg text-gray-700 font-medium px-4 py-2 bg-gray-100 rounded">
                    <span>Class: {selectedClass?.name || "-"}</span>
                    <span>Term: {selectedTerm?.name || "-"}</span>
                    <span>Session: {selectedTerm?.session.name || "-"}</span>
                  </div>
                  <div className="flex justify-between text-lg text-gray-700 font-medium px-4 py-2 bg-gray-100 rounded">
                    <span>Teacher: {selectedClass?.teacherName || "Not Assigned"}</span>
                    <span>Total Students: {students.length}</span>
                    <span>Available Reports: {results.filter((r) => r.averageScore > 0).length}</span>
                  </div>
                </div>
              </div>

              {/* Show generation progress */}
              {isGenerating && generationProgress > 0 && (
                <div className="mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Generating reports...</span>
                    <span>{generationProgress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Students Table */}
              <StudentReportsTable
                students={filteredStudents}
                results={results}
                selectedStudents={form.selectedStudents}
                onStudentSelect={handleStudentSelect}
                onGenerateReport={generateSingleReport}
                canGenerateReports={canGenerateReports}
                isGenerating={isGenerating}
                isLoading={isLoadingStudents || isLoadingResults}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </motion.div>
  )
}
