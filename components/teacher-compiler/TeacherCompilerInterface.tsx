"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
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

import type { FormState, Student, Subject, Assessment } from "@/components/score-entry/types"

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

  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
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
    queryKey: ["teacher-class-terms", teacherId, form.termId],
    queryFn: async () => {
      if (!form.termId) return []
      const result = await getTeacherClassTerms(form.termId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.termId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch teacher's subjects for selected class term
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects,
    isError: isSubjectsError,
    error: subjectsError,
  } = useQuery<Subject[]>({
    queryKey: ["teacher-subjects", teacherId, form.classId],
    queryFn: async () => {
      if (!form.classId) return []
      const result = await getTeacherSubjectsForClassTerm(form.classId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.classId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch students for selected class term
  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
    error: studentsError,
  } = useQuery<Student[]>({
    queryKey: ["teacher-students", teacherId, form.classId],
    queryFn: async () => {
      if (!form.classId) return []
      const result = await getTeacherClassTermStudents(form.classId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.classId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch assessments with status
  const {
    data: assessmentData,
    isLoading: isLoadingAssessments,
    isError: isAssessmentsError,
    error: assessmentsError,
    refetch: refetchAssessments,
  } = useQuery({
    queryKey: ["teacher-assessments-with-status", teacherId, form.classId, form.subjectId, form.termId],
    queryFn: async () => {
      if (!form.classId || !form.subjectId || !form.termId) return null
      const result = await getTeacherAssessmentsWithStatus(form.classId, form.subjectId, form.termId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.classId && !!form.subjectId && !!form.termId,
    staleTime: 2 * 60 * 1000,
  })

  // Extract assessments and statistics from the enhanced data
  const assessments = useMemo(() => {
    return assessmentData?.assessments || []
  }, [assessmentData])

  const assessmentStats = useMemo(() => {
    return assessmentData?.statistics || null
  }, [assessmentData])

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
    (studentId: string, field: keyof Assessment, value: any) => {
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
    if (!form.termId || !form.subjectId || !form.classId) {
      toast.error("Please select a term, class, and subject")
      return
    }

    const dirtyScores = Object.values(scores).filter((score) => score.isDirty)
    if (dirtyScores.length === 0) {
      toast.info("No changes to save")
      return
    }

    setIsSaving(true)
    setSaveProgress(0)

    try {
      const assessmentsToSave = dirtyScores.map((score) => ({
        id: score.id,
        studentId: score.studentId,
        subjectId: form.subjectId,
        termId: form.termId,
        studentClassTermId: students.find((s) => s.id === score.studentId)?.studentClassTermId || "",
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

      // Mark as saved
      const studentIds = dirtyScores.map((s) => s.studentId)
      const assessmentIds: Record<string, string> = {}

      if (result.data) {
        result.data.forEach((assessment, index) => {
          const studentId = dirtyScores[index].studentId
          assessmentIds[studentId] = assessment.id
        })
      }

      markSaved(studentIds, assessmentIds)

      toast.success("Assessments saved successfully", {
        description: result.message || `Saved ${dirtyScores.length} assessment(s)`,
      })

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
  }, [form.termId, form.subjectId, form.classId, scores, students, markSaved, refetchAssessments])

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
      <Card className="border shadow-md bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Assessment Compiler
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-sm text-gray-600">
            <Badge variant="outline" className="bg-blue-100 text-blue-800">
              Teacher: {teacherName}
            </Badge>
            {department && (
              <Badge variant="outline" className="bg-green-100 text-green-800">
                Department: {department}
              </Badge>
            )}
            <Badge variant="outline" className="bg-purple-100 text-purple-800">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm bg-gray-50 p-3 rounded-lg">
              <div>
                <span className="font-medium text-gray-700">Session & Term:</span>
                <div className="text-gray-900">{selectedTerm?.session.name} - {selectedTerm?.name}</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Class:</span>
                <div className="text-gray-900">{selectedClass?.className} ({selectedClass?.classLevel})</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Subject:</span>
                <div className="text-gray-900">{selectedSubject?.name} ({selectedSubject?.code})</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Students:</span>
                <div className="text-gray-900">{students.length} enrolled</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ActionButtons
              hasChanges={hasChanges}
              errorCount={errorCount}
              isSaving={isSaving}
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
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assignments Found</h3>
            <p className="text-gray-600">
              You haven't been assigned to any classes yet. Please contact your school administrator.
            </p>
          </CardContent>
        </Card>
      )}

      {form.termId && !isLoadingClassTerms && classTerms.length === 0 && (
        <Card className="border shadow-md">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Classes Assigned</h3>
            <p className="text-gray-600">
              You haven't been assigned to any classes for the selected term.
            </p>
          </CardContent>
        </Card>
      )}

      {form.classId && !isLoadingSubjects && subjects.length === 0 && (
        <Card className="border shadow-md">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Subjects Assigned</h3>
            <p className="text-gray-600">
              You haven't been assigned to teach any subjects for this class.
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}