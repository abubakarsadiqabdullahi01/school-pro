"use client"

import { useState, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Download, FileText, Loader2, Search, BarChart4, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { ClassResultsSummaryCards } from "./ClassResultsSummaryCards"
import { ClassResultsTable } from "./ClassResultsTable"
import { ClassResultsAnalysis } from "./ClassResultsAnalysis"

import {
  getClassesForTerm,
  getStudentsForClassTerm,
  getClassTermSubjects,
  getClassTermResults,
  getGradingSystem,
} from "@/app/actions/compiler"
import { exportClassResultsPDF } from "@/lib/pdf/class-results-termly"
import type { ClassLevel } from "@prisma/client"
import Image from "next/image"

interface ClassResultsOverviewProps {
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
  showPositions: boolean
  sortBy: string
  sortDirection: "asc" | "desc"
}

export function ClassResultsOverview({
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
}: ClassResultsOverviewProps) {
  const [form, setForm] = useState<FormState>({
    termId: currentTermId || "",
    level: "",
    classId: "",
    searchQuery: "",
    showPositions: true,
    sortBy: "position",
    sortDirection: "asc",
  })

  const [activeTab, setActiveTab] = useState<string>("results")
  const [isExporting, setIsExporting] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

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
  const {
    data: results = [],
    isLoading: isLoadingResults,
    refetch: refetchResults,
  } = useQuery({
    queryKey: ["results", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getClassTermResults(classTermId)
      return result.success ? result.data : []
    },
    enabled: !!classTermId,
  })

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (!results.length) {
      return {
        totalStudents: 0,
        averageScore: 0,
        passRate: 0,
        highestScore: 0,
        lowestScore: 0,
        topStudent: null,
        gradeDistribution: {},
        subjectAverages: {},
      }
    }

    const totalStudents = results.length
    const totalScores = results.map((r) => r.averageScore).filter((score) => score > 0)
    const averageScore = totalScores.length > 0 ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length : 0
    const passCount = results.filter((r) => r.averageScore >= (gradingSystem?.passMark || 40)).length
    const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0
    const highestScore = Math.max(...totalScores, 0)
    const lowestScore = totalScores.length > 0 ? Math.min(...totalScores) : 0
    const topStudent = results.find((r) => r.position === 1)

    // Grade distribution
    const gradeDistribution = results.reduce(
      (acc, result) => {
        const grade = result.grade || "F"
        acc[grade] = (acc[grade] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Subject averages
    const subjectAverages = subjects.reduce(
      (acc, subject) => {
        const scores = results
          .map((r) => r.subjects[subject.id]?.score)
          .filter((score): score is number => score !== null && score !== undefined)

        if (scores.length > 0) {
          acc[subject.id] = {
            name: subject.name,
            code: subject.code,
            average: scores.reduce((a, b) => a + b, 0) / scores.length,
            passRate: (scores.filter((s) => s >= (gradingSystem?.passMark || 40)).length / scores.length) * 100,
          }
        }
        return acc
      },
      {} as Record<string, any>,
    )

    return {
      totalStudents,
      averageScore,
      passRate,
      highestScore,
      lowestScore,
      topStudent,
      gradeDistribution,
      subjectAverages,
    }
  }, [results, subjects, gradingSystem])

  // Filter and sort results
  const filteredAndSortedResults = useMemo(() => {
    const filtered = results.filter(
      (result) =>
        result.studentName.toLowerCase().includes(form.searchQuery.toLowerCase()) ||
        result.admissionNo.toLowerCase().includes(form.searchQuery.toLowerCase()),
    )

    // Sort results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (form.sortBy) {
        case "position":
          aValue = a.position || 999
          bValue = b.position || 999
          break
        case "name":
          aValue = a.studentName
          bValue = b.studentName
          break
        case "admissionNo":
          aValue = a.admissionNo
          bValue = b.admissionNo
          break
        case "totalScore":
          aValue = a.totalScore
          bValue = b.totalScore
          break
        case "averageScore":
          aValue = a.averageScore
          bValue = b.averageScore
          break
        default:
          aValue = a.position || 999
          bValue = b.position || 999
      }

      if (typeof aValue === "string") {
        return form.sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }

      return form.sortDirection === "asc" ? aValue - bValue : bValue - aValue
    })

    return filtered
  }, [results, form.searchQuery, form.sortBy, form.sortDirection])

  // Handle form changes
  const handleTermChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, termId: value, level: "", classId: "" }))
  }, [])

  const handleLevelChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, level: value, classId: "" }))
  }, [])

  const handleClassChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, classId: value }))
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, searchQuery: value }))
  }, [])

  const handleSortChange = useCallback((sortBy: string) => {
    setForm((prev) => ({
      ...prev,
      sortBy,
      sortDirection: prev.sortBy === sortBy && prev.sortDirection === "asc" ? "desc" : "asc",
    }))
  }, [])

  const togglePositions = useCallback(() => {
    setForm((prev) => ({ ...prev, showPositions: !prev.showPositions }))
  }, [])

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    if (!filteredAndSortedResults.length) {
      toast.error("No results to export")
      return
    }

    setIsExporting(true)
    try {
      const selectedTerm = terms.find((t) => t.id === form.termId)
      const selectedClass = classes.find((c) => c.id === form.classId)

      await exportClassResultsPDF({
        results: filteredAndSortedResults,
        schoolInfo: {
          schoolName,
          schoolCode,
          schoolAddress,
          schoolPhone,
          schoolEmail,
          schoolLogo,
        },
        classInfo: {
          className: selectedClass?.name || "",
          termName: selectedTerm?.name || "",
          sessionName: selectedTerm?.session.name || "",
          teacherName: selectedClass?.teacherName || "",
        },
        subjects,
        action: "save",
      })

      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF")
    } finally {
      setIsExporting(false)
    }
  }, [
    filteredAndSortedResults,
    terms,
    classes,
    subjects,
    form.termId,
    form.classId,
    schoolName,
    schoolCode,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolLogo,
  ])

  // Print PDF
  const handlePrint = useCallback(async () => {
    if (!filteredAndSortedResults.length) {
      toast.error("No results to print")
      return
    }

    setIsPrinting(true)
    try {
      const selectedTerm = terms.find((t) => t.id === form.termId)
      const selectedClass = classes.find((c) => c.id === form.classId)

      await exportClassResultsPDF({
        results: filteredAndSortedResults,
        schoolInfo: {
          schoolName,
          schoolCode,
          schoolAddress,
          schoolPhone,
          schoolEmail,
          schoolLogo,
        },
        classInfo: {
          className: selectedClass?.name || "",
          termName: selectedTerm?.name || "",
          sessionName: selectedTerm?.session.name || "",
          teacherName: selectedClass?.teacherName || "",
        },
        subjects,
        action: "preview",
      })

      toast.success("Print preview opened")
    } catch (error) {
      console.error("Error printing:", error)
      toast.error("Failed to print")
    } finally {
      setIsPrinting(false)
    }
  }, [
    filteredAndSortedResults,
    terms,
    classes,
    subjects,
    form.termId,
    form.classId,
    schoolName,
    schoolCode,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolLogo,
  ])

  const selectedTerm = terms.find((t) => t.id === form.termId)
  const selectedClass = classes.find((c) => c.id === form.classId)

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
            Class Results Overview
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
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="term" className="text-sm font-medium">
                Academic Term
              </Label>
              <Select value={form.termId} onValueChange={handleTermChange}>
                <SelectTrigger id="term" className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id} className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors">
                      {term.session.name} - {term.name}
                      {term.isCurrent && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="level" className="text-sm font-medium">
                Class Section
              </Label>
              <Select value={form.level} onValueChange={handleLevelChange}>
                <SelectTrigger id="level" className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                  <SelectValue placeholder="Select a Section" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
                  {classLevels.map((level) => (
                    <SelectItem key={level} value={level} className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors">
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="class" className="text-sm font-medium">
                Class
              </Label>
              <Select
                value={form.classId}
                onValueChange={handleClassChange}
                disabled={!form.termId || !form.level || isLoadingClasses}
              >
                <SelectTrigger
                  id="class"
                  className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  {isLoadingClasses ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    </div>
                  ) : (
                    <SelectValue placeholder="Select a class" />
                  )}
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors">
                      {cls.name}
                      {cls.teacherName && ` (${cls.teacherName})`}
                    </SelectItem>
                  ))}
                  {classes.length === 0 && (
                    <SelectItem value="none" disabled className="px-3 py-2 text-gray-500 cursor-not-allowed">
                      No classes available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grading System Check */}
      {isLoadingGrading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-600" />
            <p className="mt-4 text-gray-500">Loading grading system...</p>
          </CardContent>
        </Card>
      ) : !gradingSystem ? (
        <Card>
          <CardContent className="py-12">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Grading System Found</AlertTitle>
              <AlertDescription>
                A grading system is required to generate class results. Please create a grading system in the admin
                settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : classTermId ? (
        <>
          {/* Summary Cards */}
          <ClassResultsSummaryCards
            summaryStats={summaryStats}
            gradingSystem={gradingSystem}
            isLoading={isLoadingResults}
          />

          {/* Main Results */}
          <Card className="border shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-2xl font-bold">Class Results</CardTitle>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportPDF}
                        disabled={isLoadingResults || !filteredAndSortedResults.length || isExporting}
                      >
                        {isExporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Export PDF
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download results as PDF</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrint}
                        disabled={isLoadingResults || !filteredAndSortedResults.length || isPrinting}
                      >
                        {isPrinting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="mr-2 h-4 w-4" />
                        )}
                        Print
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open print preview</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
                  <TabsTrigger value="results">Results Table</TabsTrigger>
                  <TabsTrigger value="analysis" disabled={!results.length}>
                    <BarChart4 className="mr-2 h-4 w-4" />
                    Analysis
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="results" className="mt-0">
                  {/* Controls */}
                  <div className="mb-6 space-y-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search by name or admission number..."
                          className="pl-8"
                          value={form.searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch id="show-positions" checked={form.showPositions} onCheckedChange={togglePositions} />
                          <Label htmlFor="show-positions" className="text-sm font-medium">
                            Show Positions
                          </Label>
                        </div>

                        <Select value={form.sortBy} onValueChange={(value) => handleSortChange(value)}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="position">Position</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="admissionNo">Admission No.</SelectItem>
                            <SelectItem value="totalScore">Total Score</SelectItem>
                            <SelectItem value="averageScore">Average Score</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Class Info Header */}
                    <div className=" flex items-start">
                                    {/* Logo on the left */}
                                    {schoolLogo && (
                                      <div className="flex-shrink-0 pl-5 pt-5">
                                        {schoolLogo ? (
                                          <Image
                                            src={schoolLogo}
                                            alt={`${schoolName} Logo`}
                                            width={90}
                                            height={90}
                                            className="object-contain rounded"
                                            onError={(e) => {
                                              console.error("Failed to load school logo:", schoolLogo)
                                              e.currentTarget.style.display = "none"
                                            }}
                                          />
                                        ) : (
                                          <div className="h-20 w-20 flex items-center justify-center rounded-full bg-gray-200 text-gray-700 font-semibold text-lg">
                                            {schoolName
                                              ? schoolName
                                                  .split(" ")
                                                  .map((s) => s[0])
                                                  .slice(0, 2)
                                                  .join("")
                                                  .toUpperCase()
                                              : "SCH"}
                                          </div>
                                        )}
                                      </div>
                                    )}
                    
                                {/* School information - centered in remaining space */}
                                <div className="flex-1 text-center space-y-2">
                                  <h1 className="text-3xl font-bold text-gray-800">{schoolName.toUpperCase()}</h1>
                                  <p className="text-base text-gray-600">{schoolAddress}</p>
                                  <p className="text-base text-gray-600">
                                    GSM: {schoolPhone} | Email: {schoolEmail}
                                  </p>
                                  <h2 className="text-xl font-semibold text-gray-700">Students Termly Continuous Assessment Sheet</h2>
                                  <hr className="border-t border-gray-400 my-2 w-3/4 mx-auto" />
                                </div>
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
                        <span>Results Found: {filteredAndSortedResults.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Results Table */}
                  <ClassResultsTable
                    results={filteredAndSortedResults}
                    subjects={subjects}
                    showPositions={form.showPositions}
                    onSort={handleSortChange}
                    sortBy={form.sortBy}
                    sortDirection={form.sortDirection}
                    isLoading={isLoadingResults || isLoadingSubjects}
                  />
                </TabsContent>

                <TabsContent value="analysis" className="mt-0">
                  {results.length > 0 && (
                    <ClassResultsAnalysis
                      results={results}
                      subjects={subjects}
                      className={selectedClass?.name || ""}
                      termName={selectedTerm?.name || ""}
                      sessionName={selectedTerm?.session.name || ""}
                      summaryStats={summaryStats}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}
    </motion.div>
  )
}
