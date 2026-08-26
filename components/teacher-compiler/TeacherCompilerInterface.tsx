"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, BookOpen, Users } from "lucide-react"

import { TeacherSelectionControls } from "./TeacherSelectionControls"
import { ScoreEntryTable } from "@/components/score-entry/ScoreEntryTable"
import { ActionButtons } from "@/components/score-entry/ActionButtons"
import { AssessmentStatusCard } from "@/components/score-entry/AssessmentStatusCard"
import { useAssessmentState } from "@/hooks/use-assessment-state"

import {
  getTeacherTerms,
  getTeacherCurrentTerm,
  getTeacherClassTerms,
  getTeacherSubjectsForClassTerm,
  getTeacherClassTermStudents,
  getTeacherAssessmentsWithStatus,
  saveTeacherAssessments,
} from "@/app/actions/teacher-compiler"

import type { FormState, Student, Subject, ScoreEntry } from "@/components/score-entry/types"
import { queryKeys, queryTiming } from "@/lib/query-keys"

interface TeacherCompilerInterfaceProps {
  teacherId: string
  schoolId: string
  schoolName: string
  schoolCode: string
  schoolLogo: string | null
  teacherName: string
  department: string | null
}

export function TeacherCompilerInterface({
  teacherId,
  schoolId,
  schoolName,
  schoolCode,
  schoolLogo,
  teacherName,
  department,
}: TeacherCompilerInterfaceProps) {
  const [form, setForm] = useState<FormState>({
    termId: "",
    level: "",
    classId: "",
    subjectId: "",
    searchQuery: "",
  })

  const [saveProgress, setSaveProgress] = useState(0)
  const queryClient = useQueryClient()

  const {
    scores,
    hasChanges,
    errorCount,
    initialized,
    initializeScores,
    updateScore,
    resetScores,
    markSaved,
    clearAll,
  } = useAssessmentState()

  // Fetch teacher's terms
  const {
    data: terms = [],
    isLoading: isLoadingTerms,
    isError: isTermsError,
    error: termsError,
  } = useQuery({
    queryKey: ["teacher-terms", teacherId],
    queryFn: async () => {
      const result = await getTeacherTerms()
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    staleTime: queryTiming.stable,
  })

  // Get current term
  const {
    data: currentTerm,
    isLoading: isLoadingCurrentTerm,
  } = useQuery({
    queryKey: ["teacher-current-term", teacherId],
    queryFn: async () => {
      const result = await getTeacherCurrentTerm()
      if (!result.success) return null
      return result.data
    },
    staleTime: queryTiming.stable,
  })

  // Set initial term when terms load
  useEffect(() => {
    if (terms.length > 0 && !form.termId) {
      const initialTermId = currentTerm?.id || terms[0]?.id
      if (initialTermId) {
        setForm(prev => ({ ...prev, termId: initialTermId }))
      }
    }
  }, [terms, currentTerm, form.termId])

  // Fetch teacher's class terms for selected term
  const {
    data: classTerms = [],
    isLoading: isLoadingClassTerms,
    isError: isClassTermsError,
    error: classTermsError,
  } = useQuery({
    queryKey: queryKeys.teacher.classes(form.termId),
    queryFn: async () => {
      if (!form.termId) return []
      const result = await getTeacherClassTerms(form.termId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!form.termId,
    staleTime: queryTiming.stable,
  })

  // Fetch teacher's subjects for selected class term
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects,
    isError: isSubjectsError,
    error: subjectsError,
  } = useQuery<Subject[]>({
    queryKey: queryKeys.teacher.subjects(form.classId),
    queryFn: async () => {
      if (!form.classId) return []
      const result = await getTeacherSubjectsForClassTerm(form.classId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!form.classId,
    staleTime: queryTiming.stable,
  })

  // Fetch students for selected class term
  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
    error: studentsError,
  } = useQuery<Student[]>({
    queryKey: queryKeys.scoreEntry.students(form.classId),
    queryFn: async () => {
      if (!form.classId) return []
      const result = await getTeacherClassTermStudents(form.classId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!form.classId,
    staleTime: queryTiming.stable,
  })

  // Fetch assessments with status
  const {
    data: assessmentData,
    isLoading: isLoadingAssessments,
    isError: isAssessmentsError,
    error: assessmentsError,
  } = useQuery({
    queryKey: queryKeys.teacher.assessments(form.classId, form.subjectId, form.termId),
    queryFn: async () => {
      if (!form.classId || !form.subjectId || !form.termId) return null
      const result = await getTeacherAssessmentsWithStatus(form.classId, form.subjectId, form.termId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.classId && !!form.subjectId && !!form.termId,
    staleTime: queryTiming.interactive,
  })

  // Extract assessments and statistics from the enhanced data
  const assessments = useMemo(() => {
    return assessmentData?.assessments || []
  }, [assessmentData])

  const assessmentStats = useMemo(() => {
    return assessmentData?.statistics || null
  }, [assessmentData])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.termId || !form.subjectId || !form.classId) {
        throw new Error("Please select a term, class, and subject")
      }

      const dirtyScores = Object.values(scores).filter((score) => score.isDirty)
      if (dirtyScores.length === 0) {
        return { dirtyScores, result: null }
      }

      const studentClassTermByStudentId = new Map(students.map((student) => [student.id, student.studentClassTermId]))
      const assessmentsToSave = dirtyScores.map((score) => ({
        id: score.id ?? undefined,
        studentId: score.studentId,
        subjectId: form.subjectId,
        termId: form.termId,
        studentClassTermId: studentClassTermByStudentId.get(score.studentId) || "",
        ca1: score.ca1,
        ca2: score.ca2,
        ca3: score.ca3,
        exam: score.exam,
        isAbsent: score.isAbsent,
        isExempt: score.isExempt,
      }))

      const result = await saveTeacherAssessments(assessmentsToSave, form.termId, form.subjectId, form.classId)

      if (!result.success) {
        throw new Error(result.error || "Failed to save assessments")
      }

      return { dirtyScores, result }
    },
    onMutate: () => {
      setSaveProgress(0)
    },
    onSuccess: async ({ dirtyScores, result }) => {
      if (!result) {
        toast.info("No changes to save")
        return
      }

      const studentIds = dirtyScores.map((score) => score.studentId)
      const assessmentIds: Record<string, string> = {}

      result.data?.forEach((assessment, index) => {
        const studentId = dirtyScores[index]?.studentId
        if (studentId) {
          assessmentIds[studentId] = assessment.id
        }
      })

      markSaved(studentIds, assessmentIds)
      toast.success("Assessments saved successfully", {
        description: result.message || `Saved ${dirtyScores.length} assessment(s)`,
      })

      await queryClient.invalidateQueries({
        queryKey: queryKeys.teacher.assessments(form.classId, form.subjectId, form.termId),
      })
    },
    onError: (error) => {
      console.error("Error saving assessments:", error)
      toast.error("Failed to save assessments", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    },
    onSettled: () => {
      setSaveProgress(0)
    },
  })

  // Initialize scores when students and assessments are loaded
  useEffect(() => {
    if (students.length > 0 && form.subjectId && !initialized && assessments.length > 0) {
      const formattedAssessments = assessments.map((assessment) => ({
        id: assessment.id,
        studentId: assessment.studentId,
        ca1: assessment.ca1,
        ca2: assessment.ca2,
        ca3: assessment.ca3,
        exam: assessment.exam,
        totalScore: assessment.totalScore,
        grade: assessment.grade,
        remark: assessment.remark,
        isAbsent: assessment.isAbsent,
        isExempt: assessment.isExempt,
        isPublished: assessment.isPublished,
      }))
      initializeScores(students, formattedAssessments)
    }
  }, [students, assessments, form.subjectId, initialized, initializeScores])

  // Handle form changes
  const handleTermChange = useCallback(
    (value: string) => {
      setForm((prev) => ({
        ...prev,
        termId: value,
        classId: "",
        subjectId: "",
      }))
      clearAll()
    },
    [clearAll],
  )

  const handleClassChange = useCallback(
    (value: string) => {
      setForm((prev) => ({
        ...prev,
        classId: value,
        subjectId: "",
      }))
      clearAll()
    },
    [clearAll],
  )

  const handleSubjectChange = useCallback(
    (value: string) => {
      setForm((prev) => ({ ...prev, subjectId: value }))
      clearAll()
    },
    [clearAll],
  )

  const handleSearchChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, searchQuery: value }))
  }, [])

  // Handle score changes
  const handleScoreChange = useCallback(
    (studentId: string, field: keyof ScoreEntry, value: any) => {
      updateScore(studentId, field, value)
    },
    [updateScore],
  )

  // Reset scores
  const handleReset = useCallback(() => {
    const formattedAssessments = assessments.map((assessment) => ({
      id: assessment.id,
      studentId: assessment.studentId,
      ca1: assessment.ca1,
      ca2: assessment.ca2,
      ca3: assessment.ca3,
      exam: assessment.exam,
      totalScore: assessment.totalScore,
      grade: assessment.grade,
      remark: assessment.remark,
      isAbsent: assessment.isAbsent,
      isExempt: assessment.isExempt,
      isPublished: assessment.isPublished,
    }))
    resetScores(formattedAssessments)
    toast.info("Changes reset to original values")
  }, [resetScores, assessments])

  // Save assessments
  const handleSave = useCallback(async () => {
    saveMutation.mutate()
  }, [saveMutation])

  // Handle query errors
  useEffect(() => {
    if (isTermsError) {
      toast.error("Failed to load terms", {
        description: termsError?.message || "An unknown error occurred",
      })
    }
    if (isClassTermsError) {
      toast.error("Failed to load assigned classes", {
        description: classTermsError?.message || "An unknown error occurred",
      })
    }
    if (isStudentsError) {
      toast.error("Failed to load students", {
        description: studentsError?.message || "An unknown error occurred",
      })
    }
    if (isSubjectsError) {
      toast.error("Failed to load assigned subjects", {
        description: subjectsError?.message || "An unknown error occurred",
      })
    }
    if (isAssessmentsError) {
      toast.error("Failed to load assessments", {
        description: assessmentsError?.message || "An unknown error occurred",
      })
    }
  }, [
    isTermsError,
    termsError,
    isClassTermsError,
    classTermsError,
    isStudentsError,
    studentsError,
    isSubjectsError,
    subjectsError,
    isAssessmentsError,
    assessmentsError,
  ])

  // Get selected items for display
  const selectedTerm = useMemo(() => terms.find((t) => t.id === form.termId), [terms, form.termId])
  const selectedClass = useMemo(() => classTerms.find((c) => c.id === form.classId), [classTerms, form.classId])
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === form.subjectId), [subjects, form.subjectId])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Teacher Info Card */}
      <Card className="border shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Assessment Compiler
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
              Teacher: {teacherName}
            </Badge>
            {department && (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                Department: {department}
              </Badge>
            )}
            <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400">
              School: {schoolName} ({schoolCode})
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Selection Controls */}
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Select Class and Subject</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose from your assigned classes and subjects to enter assessment scores
          </p>
        </CardHeader>
        <CardContent>
          <TeacherSelectionControls
            form={form}
            terms={terms}
            classTerms={classTerms}
            subjects={subjects}
            isLoadingTerms={isLoadingTerms}
            isLoadingClassTerms={isLoadingClassTerms}
            isLoadingSubjects={isLoadingSubjects}
            onTermChange={handleTermChange}
            onClassChange={handleClassChange}
            onSubjectChange={handleSubjectChange}
          />
        </CardContent>
      </Card>

      {/* Assignment Status Alert */}
      {form.classId && form.subjectId && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            You are assigned to teach {selectedSubject?.name} ({selectedSubject?.code}) for {selectedClass?.className}
          </AlertDescription>
        </Alert>
      )}

      {/* Assessment Status Overview */}
      {assessmentStats && form.classId && form.subjectId && (
        <AssessmentStatusCard
          statistics={assessmentStats}
          classInfo={assessmentData?.classInfo}
          subjectName={selectedSubject?.name}
          subjectCode={selectedSubject?.code}
          isLoading={isLoadingAssessments}
        />
      )}

      {/* Score Entry Table */}
      {form.classId && form.subjectId && (
        <Card className="border shadow-md">
          <CardHeader>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Student Assessment Scores
            </CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm bg-muted/50 p-3 rounded-lg">
              <div>
                <span className="font-medium text-foreground">Session & Term:</span>
                <div className="text-foreground">{selectedTerm?.session.name} - {selectedTerm?.name}</div>
              </div>
              <div>
                <span className="font-medium text-foreground">Class:</span>
                <div className="text-foreground">{selectedClass?.className} ({selectedClass?.classLevel})</div>
              </div>
              <div>
                <span className="font-medium text-foreground">Subject:</span>
                <div className="text-foreground">{selectedSubject?.name} ({selectedSubject?.code})</div>
              </div>
              <div>
                <span className="font-medium text-foreground">Students:</span>
                <div className="text-foreground">{students.length} enrolled</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ActionButtons
              hasChanges={hasChanges}
              errorCount={errorCount}
              isSaving={saveMutation.isPending}
              saveProgress={saveProgress}
              onSave={handleSave}
              onReset={handleReset}
            />

            <ScoreEntryTable
              students={students}
              scores={scores}
              searchQuery={form.searchQuery}
              onSearchChange={handleSearchChange}
              onScoreChange={handleScoreChange}
              isLoading={isLoadingStudents || isLoadingAssessments}
              assessmentData={assessments}
            />
          </CardContent>
        </Card>
      )}

      {/* No Data States */}
      {!isLoadingTerms && terms.length === 0 && (
        <Card className="border shadow-md">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Assignments Found</h3>
            <p className="text-muted-foreground">
              You haven't been assigned to any classes yet. Please contact your school administrator.
            </p>
          </CardContent>
        </Card>
      )}

      {form.termId && !isLoadingClassTerms && classTerms.length === 0 && (
        <Card className="border shadow-md">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Classes Assigned</h3>
            <p className="text-muted-foreground">
              You haven't been assigned to any classes for the selected term.
            </p>
          </CardContent>
        </Card>
      )}

      {form.classId && !isLoadingSubjects && subjects.length === 0 && (
        <Card className="border shadow-md">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Subjects Assigned</h3>
            <p className="text-muted-foreground">
              You haven't been assigned to teach any subjects for this class.
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
