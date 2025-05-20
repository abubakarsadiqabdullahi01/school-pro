"use client"

import { useState, useMemo, useCallback, useRef, memo } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Check, Loader2, Save, Search, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  getClassesForTerm,
  getStudentsForClassTerm,
  getSubjectsForClassTerm,
  getAssessmentsForSubject,
  saveAssessments,
} from "@/app/actions/compiler"
import type { ClassLevel } from "@prisma/client"

// Interfaces for type safety
interface Class {
  id: string
  name: string
  level: ClassLevel
  classTermId: string
  teacherId: string | null
  teacherName: string | null
}

interface Student {
  id: string
  studentClassTermId: string
  admissionNo: string
  fullName: string
}

interface Subject {
  id: string
  name: string
  code: string
  classSubjectId: string
}

interface Assessment {
  id: string
  studentId: string
  ca1Score: number | null
  ca2Score: number | null
  ca3Score: number | null
  caScore: number | null
  examScore: number | null
  totalScore: number | null
  grade: string | null
}

interface StudentScore {
  studentId: string
  studentClassTermId: string
  ca1Score: number | null
  ca2Score: number | null
  ca3Score: number | null
  examScore: number | null
  totalScore: number | null
  grade: string | null
  assessmentId: string | null
  isDirty: boolean
}

interface SubjectResultEntryProps {
  schoolId: string
  schoolName: string
  schoolCode: string
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

// Memoized Select Wrapper to prevent unnecessary re-renders
const MemoizedSelect = memo(
  ({ id, defaultValue, onValueChange, disabled, children, placeholder }: {
    id: string
    defaultValue?: string
    onValueChange: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
    placeholder: string
  }) => (
    <Select defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="border-gray-300">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  ),
  (prev, next) =>
    prev.defaultValue === next.defaultValue &&
    prev.disabled === next.disabled &&
    prev.onValueChange === next.onValueChange
)
MemoizedSelect.displayName = "MemoizedSelect"

export function SubjectResultEntryComponent({
  schoolId,
  schoolName,
  schoolCode,
  schoolLogo,
  terms,
  currentTermId,
  classLevels,
}: SubjectResultEntryProps) {
  // Consolidated form state
  const [form, setForm] = useState({
    termId: currentTermId || "",
    level: "",
    classId: "",
    subjectId: "",
    searchQuery: "",
  })
  const [studentScores, setStudentScores] = useState<Record<string, StudentScore>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

  // Ref to track classTermId and prevent state thrashing
  const classTermIdRef = useRef<string>("")
  const scoresInitializedRef = useRef(false)
  const prevClassTermIdRef = useRef<string>("")

  // Fetch classes
  const {
    data: classes = [],
    isLoading: isLoadingClasses,
    isError: isClassesError,
    error: classesError,
  } = useQuery<Class[]>({
    queryKey: ["classes", form.termId, form.level],
    queryFn: async () => {
      if (!form.termId || !form.level) return []
      const result = await getClassesForTerm(form.termId, form.level as ClassLevel)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.termId && !!form.level,
    staleTime: 5000,
    keepPreviousData: true,
  })

  // Derive classTermId from selected class
  const classTermId = useMemo(() => {
    if (!form.classId || classes.length === 0) return ""
    const selectedClass = classes.find((c) => c.id === form.classId)
    return selectedClass?.classTermId || ""
  }, [form.classId, classes])

  // Update ref and clear subjectId if classTermId changes
  if (classTermId !== prevClassTermIdRef.current) {
    classTermIdRef.current = classTermId
    prevClassTermIdRef.current = classTermId
    if (classTermId && form.subjectId) {
      setForm((prev) => ({ ...prev, subjectId: "" }))
      setStudentScores({})
      scoresInitializedRef.current = false
    }
  }

  // Fetch students
  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
    error: studentsError,
  } = useQuery<Student[]>({
    queryKey: ["students", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getStudentsForClassTerm(classTermId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!classTermId,
    staleTime: 5000,
    keepPreviousData: true,
  })

  // Fetch subjects
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects,
    isError: isSubjectsError,
    error: subjectsError,
  } = useQuery<Subject[]>({
    queryKey: ["subjects", classTermId],
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getSubjectsForClassTerm(classTermId)
      if (!result.success) throw new Error(result.error)
      console.log("Fetched subjects for classTermId:", classTermId, result.data)
      return result.data
    },
    enabled: !!classTermId,
    staleTime: 5000,
    keepPreviousData: true,
  })

  // Fetch assessments
  const {
    data: assessments = [],
    isLoading: isLoadingAssessments,
    isError: isAssessmentsError,
    error: assessmentsError,
    refetch: refetchAssessments,
  } = useQuery<Assessment[]>({
    queryKey: ["assessments", classTermId, form.subjectId],
    queryFn: async () => {
      if (!classTermId || !form.subjectId) return []
      const result = await getAssessmentsForSubject(classTermId, form.subjectId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!classTermId && !!form.subjectId,
    staleTime: 5000,
    keepPreviousData: true,
  })

  // Handle query errors
  const handleQueryErrors = useCallback(() => {
    if (isClassesError) {
      toast.error("Failed to load classes", {
        description: classesError?.message || "An unknown error occurred",
      })
    }
    if (isStudentsError) {
      toast.error("Failed to load students", {
        description: studentsError?.message || "An unknown error occurred",
      })
    }
    if (isSubjectsError) {
      toast.error("Failed to load subjects", {
        description: subjectsError?.message || "An unknown error occurred",
      })
    }
    if (isAssessmentsError) {
      toast.error("Failed to load assessments", {
        description: assessmentsError?.message || "An unknown error occurred",
      })
    }
  }, [
    isClassesError,
    classesError,
    isStudentsError,
    studentsError,
    isSubjectsError,
    subjectsError,
    isAssessmentsError,
    assessmentsError,
  ])

  // Initialize student scores
  const initializeScores = useCallback(() => {
    if (students.length > 0 && form.subjectId && !scoresInitializedRef.current) {
      console.log("Initializing student scores for subjectId:", form.subjectId)
      const newScores: Record<string, StudentScore> = {}
      students.forEach((student) => {
        const existingAssessment = assessments.find((a) => a.studentId === student.id)
        newScores[student.id] = {
          studentId: student.id,
          studentClassTermId: student.studentClassTermId,
          ca1Score: existingAssessment?.ca1Score ?? null,
          ca2Score: existingAssessment?.ca2Score ?? null,
          ca3Score: existingAssessment?.ca3Score ?? null,
          examScore: existingAssessment?.examScore ?? null,
          totalScore: existingAssessment?.totalScore ?? null,
          grade: existingAssessment?.grade ?? null,
          assessmentId: existingAssessment?.id ?? null,
          isDirty: false,
        }
      })
      setStudentScores(newScores)
      scoresInitializedRef.current = true
    }
  }, [students, assessments, form.subjectId])

  // Call error handling and score initialization
  if (
    isClassesError ||
    isStudentsError ||
    isSubjectsError ||
    isAssessmentsError ||
    (students.length > 0 && form.subjectId)
  ) {
    handleQueryErrors()
    initializeScores()
  }

  // Handle form changes
  const handleTermChange = useCallback((value: string) => {
    console.log("Term changed:", value)
    setForm((prev) => ({
      ...prev,
      termId: value,
      level: "",
      classId: "",
      subjectId: "",
    }))
    setStudentScores({})
    scoresInitializedRef.current = false
  }, [])

  const handleLevelChange = useCallback((value: string) => {
    console.log("Level changed:", value)
    setForm((prev) => ({
      ...prev,
      level: value,
      classId: "",
      subjectId: "",
    }))
    setStudentScores({})
    scoresInitializedRef.current = false
  }, [])

  const handleClassChange = useCallback((value: string) => {
    console.log("Class changed:", value)
    setForm((prev) => ({
      ...prev,
      classId: value,
      subjectId: "",
    }))
    setStudentScores({})
    scoresInitializedRef.current = false
  }, [])

  const handleSubjectChange = useCallback((value: string) => {
    console.log("Subject changed:", value)
    setForm((prev) => ({ ...prev, subjectId: value }))
    setStudentScores({})
    scoresInitializedRef.current = false
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, searchQuery: value }))
  }, [])

  // Memoize filtered students
  const filteredStudents = useMemo(() => {
    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(form.searchQuery.toLowerCase()) ||
        student.admissionNo.toLowerCase().includes(form.searchQuery.toLowerCase())
    )
  }, [students, form.searchQuery])

  // Get selected term, class, and subject
  const selectedTerm = useMemo(() => terms.find((t) => t.id === form.termId), [terms, form.termId])
  const selectedClass = useMemo(() => classes.find((c) => c.id === form.classId), [classes, form.classId])
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === form.subjectId), [subjects, form.subjectId])

  // Handle score change
  const handleScoreChange = useCallback(
    (studentId: string, field: keyof StudentScore, value: string) => {
      const numValue = value === "" ? null : Number(value)

      // Validate input
      if (numValue !== null && (isNaN(numValue) || numValue < 0)) {
        toast.error("Please enter a valid score")
        return
      }

      // Validate score range
      if (numValue !== null) {
        const maxScore = field === "examScore" ? 70 : 10
        if (numValue > maxScore) {
          toast.error(`Score must be between 0 and ${maxScore}`)
          return
        }
      }

      setStudentScores((prev) => {
        const updatedScore = { ...prev[studentId], [field]: numValue, isDirty: true }

        // Calculate total score and grade
        let totalScore = 0
        let validScores = 0

        if (updatedScore.ca1Score !== null) {
          totalScore += updatedScore.ca1Score
          validScores++
        }
        if (updatedScore.ca2Score !== null) {
          totalScore += updatedScore.ca2Score
          validScores++
        }
        if (updatedScore.ca3Score !== null) {
          totalScore += updatedScore.ca3Score
          validScores++
        }
        if (updatedScore.examScore !== null) {
          totalScore += updatedScore.examScore
          validScores++
        }

        // Update total and grade only if all scores are present
        if (validScores === 4) {
          updatedScore.totalScore = totalScore
          updatedScore.grade =
            totalScore >= 70
              ? "A"
              : totalScore >= 60
              ? "B"
              : totalScore >= 50
              ? "C"
              : totalScore >= 45
              ? "D"
              : totalScore >= 40
              ? "E"
              : "F"
        } else {
          updatedScore.totalScore = null
          updatedScore.grade = null
        }

        return { ...prev, [studentId]: updatedScore }
      })
    },
    []
  )

  // Reset modified scores
  const handleReset = useCallback(() => {
    setStudentScores((prev) => {
      const resetScores = { ...prev }
      Object.keys(resetScores).forEach((studentId) => {
        if (resetScores[studentId].isDirty) {
          const originalAssessment = assessments.find((a) => a.studentId === studentId)
          resetScores[studentId] = {
            ...resetScores[studentId],
            ca1Score: originalAssessment?.ca1Score ?? null,
            ca2Score: originalAssessment?.ca2Score ?? null,
            ca3Score: originalAssessment?.ca3Score ?? null,
            examScore: originalAssessment?.examScore ?? null,
            totalScore: originalAssessment?.totalScore ?? null,
            grade: originalAssessment?.grade ?? null,
            isDirty: false,
          }
        }
      })
      return resetScores
    })
    toast.info("Changes reset")
  }, [assessments])

  // Save assessments
  const handleSaveAssessments = useCallback(async () => {
    if (!classTermId || !form.subjectId) {
      toast.error("Please select a class and subject")
      return
    }

    const dirtyScores = Object.values(studentScores).filter((score) => score.isDirty)
    if (dirtyScores.length === 0) {
      toast.info("No changes to save")
      return
    }

    setIsSaving(true)
    setSaveProgress(0)

    try {
      console.log("Saving assessments:", { classTermId, subjectId: form.subjectId, dirtyScores })
      const assessmentsToSave = dirtyScores.map((score) => ({
        id: score.assessmentId,
        studentId: score.studentId,
        studentClassTermId: score.studentClassTermId,
        classTermId,
        subjectId: form.subjectId,
        ca1Score: score.ca1Score,
        ca2Score: score.ca2Score,
        ca3Score: score.ca3Score,
        examScore: score.examScore,
        totalScore: score.totalScore,
        grade: score.grade,
      }))

      const batchSize = 5
      const totalBatches = Math.ceil(assessmentsToSave.length / batchSize)
      let updatedScores = { ...studentScores }

      for (let i = 0; i < assessmentsToSave.length; i += batchSize) {
        const batch = assessmentsToSave.slice(i, i + batchSize)
        const result = await saveAssessments(batch)

        if (!result.success) {
          throw new Error(result.error || "Failed to save assessments")
        }

        const currentBatch = Math.floor(i / batchSize) + 1
        setSaveProgress(Math.round((currentBatch / totalBatches) * 100))

        batch.forEach((assessment, index) => {
          if (result.data && result.data[index]) {
            const studentId = assessment.studentId
            updatedScores[studentId] = {
              ...updatedScores[studentId],
              assessmentId: result.data[index].id,
              isDirty: false,
            }
          }
        })
      }

      setStudentScores(updatedScores)
      toast.success("Assessments saved successfully")
      await refetchAssessments()
    } catch (error) {
      console.error("Error saving assessments:", error)
      toast.error("Failed to save assessments", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsSaving(false)
      setSaveProgress(0)
    }
  }, [classTermId, form.subjectId, studentScores, refetchAssessments])

  // Check if any scores have been modified
  const hasChanges = useMemo(() => Object.values(studentScores).some((score) => score.isDirty), [studentScores])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Subject Result Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="term" className="text-lg font-semibold text-gray-700">
                Academic Term
              </Label>
              <MemoizedSelect
                id="term"
                defaultValue={form.termId}
                onValueChange={handleTermChange}
                placeholder="Select a term"
                key={`term-${form.termId}`}
              >
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id} className="text-gray-800">
                    {term.session.name} - {term.name}
                    {term.isCurrent && " (Current)"}
                  </SelectItem>
                ))}
              </MemoizedSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level" className="text-lg font-semibold text-gray-700">
                Class Level
              </Label>
              <MemoizedSelect
                id="level"
                defaultValue={form.level}
                onValueChange={handleLevelChange}
                disabled={!form.termId}
                placeholder="Select a level"
                key={`level-${form.termId}`}
              >
                {classLevels.map((level) => (
                  <SelectItem key={level} value={level} className="text-gray-800">
                    {level}
                  </SelectItem>
                ))}
              </MemoizedSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class" className="text-lg font-semibold text-gray-700">
                Class
              </Label>
              <MemoizedSelect
                id="class"
                defaultValue={form.classId}
                onValueChange={handleClassChange}
                disabled={!form.termId || !form.level || isLoadingClasses}
                placeholder="Select a class"
                key={`class-${form.level}`}
              >
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id} className="text-gray-800">
                    {cls.name}
                    {cls.teacherName && ` (${cls.teacherName})`}
                  </SelectItem>
                ))}
                {classes.length === 0 && (
                  <SelectItem value="none" disabled className="text-gray-500">
                    No classes available
                  </SelectItem>
                )}
              </MemoizedSelect>
              {isLoadingClasses && <Loader2 className="h-4 w-4 animate-spin text-gray-600" />}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject" className="text-lg font-semibold text-gray-700">
                Subject
              </Label>
              <MemoizedSelect
                id="subject"
                defaultValue={form.subjectId}
                onValueChange={handleSubjectChange}
                disabled={!classTermId || isLoadingSubjects || subjects.length === 0}
                placeholder="Select a subject"
                key={`subject-${classTermId}`}
              >
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id} className="text-gray-800">
                    {subject.name} ({subject.code})
                  </SelectItem>
                ))}
                {subjects.length === 0 && (
                  <SelectItem value="none" disabled className="text-gray-500">
                    No subjects available
                  </SelectItem>
                )}
              </MemoizedSelect>
              {isLoadingSubjects && <Loader2 className="h-4 w-4 animate-spin text-gray-600" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {classTermId && form.subjectId && (
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl font-bold">Student Scores</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleReset}
                disabled={isSaving || !hasChanges}
                variant="outline"
                className="border-gray-300"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button
                onClick={handleSaveAssessments}
                disabled={isSaving || !hasChanges || isLoadingAssessments}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-6 space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    School: {schoolName} ({schoolCode})
                  </div>
                  <div className="text-sm font-medium">Session: {selectedTerm?.session.name || "-"}</div>
                  <div className="text-sm font-medium">Term: {selectedTerm?.name || "-"}</div>
                  <div className="text-sm font-medium">Class: {selectedClass?.name || "-"}</div>
                  <div className="text-sm font-medium">
                    Subject: {selectedSubject?.name ? `${selectedSubject.name} (${selectedSubject.code})` : "-"}
                  </div>
                  <div className="text-sm font-medium">
                    Class Teacher:{" "}
                    {selectedClass?.teacherName || (
                      <Badge variant="outline" className="ml-2">
                        Not Assigned
                      </Badge>
                    )}
                  </div>
                </div>
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
              </div>

              {isSaving && saveProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Saving assessments...</span>
                    <span>{saveProgress}%</span>
                  </div>
                  <Progress value={saveProgress} className="h-2" />
                </div>
              )}

              {isLoadingStudents || isLoadingAssessments ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-gray-500">No students found for this class.</p>
                </div>
              ) : (
                <div className="rounded-md border border-gray-300 overflow-x-auto">
                  <Table className="min-w-full bg-white">
                    <TableHeader>
                      <TableRow className="bg-gray-200">
                        <TableHead className="w-[60px] text-center font-bold text-gray-800">S/N</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-gray-800">Admission No.</TableHead>
                        <TableHead className="font-bold text-gray-800">Name</TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-gray-800">
                          1st C.A
                          <div className="text-xs">(10%)</div>
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-gray-800">
                          2nd C.A
                          <div className="text-xs">(10%)</div>
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-gray-800">
                          3rd C.A
                          <div className="text-xs">(10%)</div>
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-gray-800">
                          Exam
                          <div className="text-xs">(70%)</div>
                        </TableHead>
                        <TableHead className="w-[100px] text-center font-bold text-gray-800">Total</TableHead>
                        <TableHead className="w-[80px] text-center font-bold text-gray-800">Grade</TableHead>
                        <TableHead className="w-[80px] text-center font-bold text-gray-800">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student, index) => {
                        const score = studentScores[student.id]
                        return (
                          <TableRow key={student.id} className={score?.isDirty ? "bg-yellow-50" : "hover:bg-gray-100"}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell className="text-center">{student.admissionNo}</TableCell>
                            <TableCell>{student.fullName}</TableCell>
                            <TableCell className="text-center p-1">
                              <Input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={score?.ca1Score ?? ""}
                                onChange={(e) => handleScoreChange(student.id, "ca1Score", e.target.value)}
                                className="h-8 text-center"
                                aria-label="First CA Score"
                              />
                            </TableCell>
                            <TableCell className="text-center p-1">
                              <Input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={score?.ca2Score ?? ""}
                                onChange={(e) => handleScoreChange(student.id, "ca2Score", e.target.value)}
                                className="h-8 text-center"
                                aria-label="Second CA Score"
                              />
                            </TableCell>
                            <TableCell className="text-center p-1">
                              <Input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={score?.ca3Score ?? ""}
                                onChange={(e) => handleScoreChange(student.id, "ca3Score", e.target.value)}
                                className="h-8 text-center"
                                aria-label="Third CA Score"
                              />
                            </TableCell>
                            <TableCell className="text-center p-1">
                              <Input
                                type="number"
                                min="0"
                                max="70"
                                step="0.5"
                                value={score?.examScore ?? ""}
                                onChange={(e) => handleScoreChange(student.id, "examScore", e.target.value)}
                                className="h-8 text-center"
                                aria-label="Exam Score"
                              />
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {score?.totalScore !== null ? score.totalScore : "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {score?.grade ? (
                                <Badge
                                  className={`${
                                    score.grade === "A"
                                      ? "bg-green-100 text-green-800"
                                      : score.grade === "B"
                                      ? "bg-blue-100 text-blue-800"
                                      : score.grade === "C"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : score.grade === "D" || score.grade === "E"
                                      ? "bg-orange-100 text-orange-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {score.grade}
                                </Badge>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {score?.isDirty ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                  Modified
                                </Badge>
                              ) : score?.assessmentId ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                  <Check className="h-3 w-3 mr-1" />
                                  Saved
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">
                                  New
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}