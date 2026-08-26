"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Download, FileText, Loader2, Search, BarChart4, ArrowUpDown, AlertTriangle, CheckCircle, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getClassesForTerm,
  getStudentsForClassTerm,
  getClassTermSubjects,
  getClassTermResults,
  getGradingSystem,
  publishClassTermResults,
  unpublishClassTermResults,
} from "@/app/actions/compiler"
import { exportClassResultsPDF } from "@/lib/pdf/class-results-termly"
import { ClassResultsAnalysis } from "@/components/compiler/class-results-analysis"
import type { ClassLevel } from "@prisma/client"

interface ClassResultsTermlyProps {
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


export function ClassResultsTermlyComponent({
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
}: ClassResultsTermlyProps) {
  const [selectedTermId, setSelectedTermId] = useState<string>(currentTermId || "")
  const [selectedLevel, setSelectedLevel] = useState<string>("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [selectedClassTermId, setSelectedClassTermId] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("results")
  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "ascending" | "descending"
  }>({ key: "position", direction: "ascending" })

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

  const { data: classes = [], isLoading: isLoadingClasses } = useQuery({
    queryKey: ["classes", selectedTermId, selectedLevel],
    queryFn: async () => {
      if (!selectedTermId || !selectedLevel) return []
      const result = await getClassesForTerm(selectedTermId, selectedLevel as ClassLevel)
      return result.success ? result.data : []
    },
    enabled: !!selectedTermId && !!selectedLevel,
  })

  const { data: students = [], isLoading: isLoadingStudents } = useQuery({
    queryKey: ["students", selectedClassTermId],
    queryFn: async () => {
      if (!selectedClassTermId) return []
      const result = await getStudentsForClassTerm(selectedClassTermId)
      return result.success ? result.data : []
    },
    enabled: !!selectedClassTermId,
  })

  const { data: subjects = [], isLoading: isLoadingSubjects } = useQuery({
    queryKey: ["subjects", selectedClassTermId],
    queryFn: async () => {
      if (!selectedClassTermId) return []
      const result = await getClassTermSubjects(selectedClassTermId)
      return result.success ? result.data : []
    },
    enabled: !!selectedClassTermId,
  })

  const { data: results = [], isLoading: isLoadingResults } = useQuery({
    queryKey: ["results", selectedClassTermId],
    queryFn: async () => {
      if (!selectedClassTermId) return []
      const result = await getClassTermResults(selectedClassTermId)
      return result.success ? result.data : []
    },
    enabled: !!selectedClassTermId,
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      const result = await publishClassTermResults(selectedClassTermId)
      if (!result.success) throw new Error(result.error || result.message)
      return result
    },
    onSuccess: (result) => {
      toast.success(result.message)
    },
    onError: (error) => {
      toast.error("Not released", {
        description: error.message,
      })
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: async (reason: string) => {
      const result = await unpublishClassTermResults(selectedClassTermId, reason)
      if (!result.success) throw new Error(result.error || result.message)
      return result
    },
    onSuccess: (result) => {
      toast.success(result.message)
    },
    onError: (error) => {
      toast.error("Not withdrawn", {
        description: error.message,
      })
    },
  })

  useEffect(() => {
    setSelectedClassId("")
    setSelectedClassTermId("")
  }, [selectedTermId, selectedLevel])

  useEffect(() => {
    if (selectedClassId && classes) {
      const classTermId = classes.find((c) => c.id === selectedClassId)?.classTermId
      setSelectedClassTermId(classTermId || "")
    }
  }, [selectedClassId, classes])

  const filteredResults = useMemo(() => {
    return results.filter(
      (result) =>
        result.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        result.admissionNo.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [results, searchQuery])

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      if (sortConfig.key === "position") {
        return sortConfig.direction === "ascending" ? a.position - b.position : b.position - a.position
      } else if (sortConfig.key === "totalScore") {
        return sortConfig.direction === "ascending" ? a.totalScore - b.totalScore : b.totalScore - a.totalScore
      } else if (sortConfig.key === "averageScore") {
        return sortConfig.direction === "ascending" ? a.averageScore - b.averageScore : b.averageScore - a.averageScore
      } else if (sortConfig.key === "studentName") {
        return sortConfig.direction === "ascending"
          ? a.studentName.localeCompare(b.studentName)
          : b.studentName.localeCompare(a.studentName)
      } else if (sortConfig.key === "gender") {
        const genderA = a.gender ?? ""
        const genderB = b.gender ?? ""
        return sortConfig.direction === "ascending" ? genderA.localeCompare(genderB) : genderB.localeCompare(genderA)
      } else if (sortConfig.key.startsWith("subject_")) {
        const subjectId = sortConfig.key.replace("subject_", "")
        const scoreA = a.subjects[subjectId]?.score || 0
        const scoreB = b.subjects[subjectId]?.score || 0
        return sortConfig.direction === "ascending" ? scoreA - scoreB : scoreB - scoreA
      }
      return 0
    })
  }, [filteredResults, sortConfig])

  const selectedTerm = terms.find((t) => t.id === selectedTermId)
  const selectedClass = classes.find((c) => c.id === selectedClassId)

  const handleExportPDF = async () => {
    if (!sortedResults.length) {
      toast.error("No results to export")
      return
    }

    try {
        await exportClassResultsPDF({
        results: sortedResults,
        schoolInfo: { schoolName, schoolCode, schoolAddress, schoolPhone, schoolEmail, schoolLogo },
        classInfo: {
            className: selectedClass?.name,
            termName: selectedTerm?.name,
            sessionName: selectedTerm?.session.name,
            teacherName: selectedClass?.teacherName,
        },
        subjects,
        action: "save", // For download
        })

      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF", { description: "An error occurred while exporting the PDF." })
    }
  }

const handlePrint = async () => {
  if (!sortedResults.length) {
    toast.error("No results to print")
    return
  }

  try {
     await exportClassResultsPDF({
      results: sortedResults,
      schoolInfo: { schoolName, schoolCode, schoolAddress, schoolPhone, schoolEmail, schoolLogo },
      classInfo: {
        className: selectedClass?.name,
        termName: selectedTerm?.name,
        sessionName: selectedTerm?.session.name,
        teacherName: selectedClass?.teacherName,
      },
      subjects,
      action: "preview", // 👈 This triggers opening the PDF in a new tab
    })
    toast.success("Print preview opened")
  } catch (error) {
    console.error("Error printing:", error)
    toast.error("Failed to print", {
      description: error instanceof Error ? error.message : "An error occurred while preparing the print.",
    })
  }
}

  const handleAutoPublish = useCallback(() => {
    if (!selectedClassTermId) {
      toast.error("No class selected")
      return
    }
    publishMutation.mutate()
  }, [selectedClassTermId, publishMutation])

  const handleWithdraw = useCallback(() => {
    if (!selectedClassTermId) {
      toast.error("No class selected")
      return
    }
    // A reason is required by the action, because an unexplained withdrawal is exactly what
    // a parent will ask about and nobody will be able to answer.
    const reason = window.prompt(
      "Why are these results being withdrawn from parents?\n\nThis is recorded in the audit log.",
    )
    if (reason === null) return
    if (!reason.trim()) {
      toast.error("A reason is required to withdraw results")
      return
    }
    withdrawMutation.mutate(reason)
  }, [selectedClassTermId, withdrawMutation])

  const requestSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "ascending" ? "descending" : "ascending",
    }))
  }

  const getGradeColor = (grade: string) => {
    const firstChar = grade.charAt(0).toUpperCase()
    switch (firstChar) {
      case "A": return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "B": return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      case "C": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      case "D": case "E": return "bg-orange-500/10 text-orange-700 dark:text-orange-400"
      case "F": return "bg-red-500/10 text-red-700 dark:text-red-400"
      default: return "bg-muted text-foreground"
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            Class Termly Results
            {isLoadingGrading ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <div className="space-y-2">
              <Label htmlFor="term" className="text-lg font-semibold text-foreground">Academic Term</Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger id="term" className="border-border">
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
              <Label htmlFor="level" className="text-lg font-semibold text-foreground">Class Section</Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger id="level" className="border-border">
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {classLevels.map((level) => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="class" className="text-lg font-semibold text-foreground">Class</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={!selectedTermId || !selectedLevel || isLoadingClasses}
              >
                <SelectTrigger id="class" className="border-border">
                  {isLoadingClasses ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
                    <SelectItem value="none" disabled>No classes available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoadingGrading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Loading grading system...</p>
          </CardContent>
        </Card>
      ) : !gradingSystem ? (
        <Card>
          <CardContent className="py-12">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Grading System Found</AlertTitle>
              <AlertDescription>
                A grading system is required to generate class results. Please create a grading system in the admin settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : selectedClassTermId ? (
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
                      disabled={isLoadingResults || !sortedResults.length}
                    >
                      <Download className="mr-2 h-4 w-4" />
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
                      disabled={isLoadingResults || !sortedResults.length}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Print
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open print preview</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoPublish}
                      disabled={isLoadingResults || publishMutation.isPending || !sortedResults.length}
                    >
                      {publishMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-4 w-4" />
                      )}
                      Release to parents
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Makes these results visible to students and parents. Every subject must be
                    entered first — mark a student absent or exempt if they have no score.
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleWithdraw}
                      disabled={isLoadingResults || withdrawMutation.isPending || !sortedResults.length}
                    >
                      {withdrawMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="mr-2 h-4 w-4" />
                      )}
                      Withdraw
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Hides these results from students and parents again. Asks for a reason,
                    which is recorded in the audit log.
                  </TooltipContent>
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
                <div className="mb-6 space-y-4">
                  <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">{schoolName.toUpperCase()}</h1>
                    <p className="text-base text-muted-foreground">{schoolAddress}</p>
                    <p className="text-base text-muted-foreground">GSM: {schoolPhone} | Email: {schoolEmail}</p>
                    <h2 className="text-xl font-semibold text-foreground">Termly Class Results</h2>
                    <hr className="border-t border-border my-2 w-3/4 mx-auto" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-lg text-foreground font-medium px-4 py-2 bg-muted rounded">
                      <span>Class: {selectedClass?.name || "-"}</span>
                      <span>Term: {selectedTerm?.name || "-"}</span>
                      <span>Session: {selectedTerm?.session.name || "-"}</span>
                    </div>
                    <div className="flex justify-between text-lg text-foreground font-medium px-4 py-2 bg-muted rounded">
                      <span>Teacher: {selectedClass?.teacherName || "Not Assigned"}</span>
                      <span>Total Students: {students.length}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search by name or admission number..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {isLoadingResults || isLoadingSubjects ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : !subjects.length ? (
                    <div className="py-12 text-center">
                      <p className="text-muted-foreground">No subjects found for this class.</p>
                    </div>
                  ) : !sortedResults.length ? (
                    <div className="py-12 text-center">
                      <p className="text-muted-foreground">
                        No results found. Ensure subject scores have been entered.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-border overflow-x-auto">
                      <Table className="min-w-full bg-card">
                        <TableHeader>
                          <TableRow className="bg-muted">
                            <TableHead className="w-[60px] text-center font-bold text-foreground sticky left-0 bg-muted z-10">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center justify-center cursor-pointer"
                                      onClick={() => requestSort("position")}
                                    >
                                      Pos.
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by position</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="w-[120px] text-center font-bold text-foreground sticky left-[60px] bg-muted z-10">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center justify-center cursor-pointer"
                                      onClick={() => requestSort("admissionNo")}
                                    >
                                      Adm. No.
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by admission number</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="font-bold text-foreground sticky left-[180px] bg-muted z-10 min-w-[200px]">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center cursor-pointer"
                                      onClick={() => requestSort("studentName")}
                                    >
                                      Name
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by name</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="w-[80px] text-center font-bold text-foreground">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center justify-center cursor-pointer"
                                      onClick={() => requestSort("gender")}
                                    >
                                      Gender
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by gender</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            {subjects.map((subject) => (
                              <TableHead key={subject.id} className="w-[80px] text-center font-bold text-foreground">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="flex flex-col items-center justify-center cursor-pointer"
                                        onClick={() => requestSort(`subject_${subject.id}`)}
                                      >
                                        <span>{subject.code}</span>
                                        <ArrowUpDown className="h-3 w-3 mt-1" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>Sort by {subject.name} score</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableHead>
                            ))}
                            <TableHead className="w-[80px] text-center font-bold text-foreground">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center justify-center cursor-pointer"
                                      onClick={() => requestSort("totalScore")}
                                    >
                                      Total
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by total score</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="w-[80px] text-center font-bold text-foreground">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="flex items-center justify-center cursor-pointer"
                                      onClick={() => requestSort("averageScore")}
                                    >
                                      Avg.
                                      <ArrowUpDown className="ml-1 h-4 w-4" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>Sort by average score</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="w-[80px] text-center font-bold text-foreground">Grade</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedResults.map((result) => (
                            <TableRow key={result.studentId} className="hover:bg-muted">
                              <TableCell className="text-center font-medium sticky left-0 bg-card z-10">
                                {result.position === 0 ? "-" : `${result.position}${getOrdinalSuffix(result.position)}`}
                              </TableCell>
                              <TableCell className="text-center sticky left-[60px] bg-card z-10">
                                {result.admissionNo}
                              </TableCell>
                              <TableCell className="sticky left-[180px] bg-card z-10 min-w-[200px]">
                                {result.studentName}
                              </TableCell>
                              <TableCell className="text-center">
                                {result.gender === "MALE" ? "M" : result.gender === "FEMALE" ? "F" : "-"}
                              </TableCell>
                              {subjects.map((subject) => {
                                const subjectResult = result.subjects[subject.id]
                                const score = subjectResult?.score
                                const grade = subjectResult?.grade ?? null
                                return (
                                  <TableCell key={subject.id} className="text-center">
                                    {score !== null && score !== undefined ? (
                                      <div className="flex flex-col items-center">
                                        <span>{score.toFixed(1)}</span>
                                        {grade && (
                                          <Badge className={`text-xs mt-1 ${getGradeColor(grade)}`}>
                                            {grade}
                                          </Badge>
                                        )}
                                      </div>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                )
                              })}
                              <TableCell className="text-center font-medium">{result.totalScore.toFixed(1)}</TableCell>
                              <TableCell className="text-center font-medium">{result.averageScore.toFixed(1)}</TableCell>
                              <TableCell className="text-center">
                                <Badge className={getGradeColor(result.grade)}>{result.grade}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="analysis" className="mt-0">
                {results.length > 0 && (
                  <ClassResultsAnalysis
                    results={results}
                    subjects={subjects}
                    className={selectedClass?.name || ""}
                    termName={selectedTerm?.name || ""}
                    sessionName={selectedTerm?.session.name || ""}
                  />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </motion.div>
  )
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
