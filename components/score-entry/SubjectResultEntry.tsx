"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle } from "lucide-react"
import { SelectionControls } from "./SelectionControls"
import { ScoreEntryTable } from "./ScoreEntryTable"
import { ActionButtons } from "./ActionButtons"
import { AssessmentStatusCard } from "./AssessmentStatusCard"
import { useAssessmentState } from "../../hooks/use-assessment-state"
import type { FormState, Student, Subject, ScoreEntry } from "./types"
import { getClassesForTerm, getStudentsForClassTerm, getSubjectsForClassTerm } from "@/app/actions/compiler"
import { getAssessmentsWithStatus, saveAssessments, checkTeacherAssignment } from "@/app/actions/compiler-improved"
import type { ClassLevel } from "@prisma/client"
import { queryKeys, queryTiming } from "@/lib/query-keys"

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

export function SubjectResultEntry({
  schoolId,
  schoolName,
  schoolCode,
  schoolLogo,
  terms,
  currentTermId,
  classLevels,
}: SubjectResultEntryProps) {
  const [form, setForm] = useState<FormState>({
    termId: currentTermId || "",
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

  // Fetch classes
  const {
    data: classes = [],
    isLoading: isLoadingClasses,
    isError: isClassesError,
    error: classesError,
  } = useQuery({
    queryKey: queryKeys.scoreEntry.classes(form.termId, form.level),
    queryFn: async () => {
      if (!form.termId || !form.level) return []
      const result = await getClassesForTerm(form.termId, form.level as ClassLevel)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!form.termId && !!form.level,
    staleTime: queryTiming.stable,
  })

  // Get classTermId from selected class
  const classTermId = useMemo(() => {
    if (!form.classId || classes.length === 0) return ""
    const selectedClass = classes.find((c) => c.id === form.classId)
    return selectedClass?.classTermId || ""
  }, [form.classId, classes])

  // Fetch students
  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
    error: studentsError,
  } = useQuery<Student[]>({
    queryKey: queryKeys.scoreEntry.students(classTermId),
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getStudentsForClassTerm(classTermId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!classTermId,
    staleTime: queryTiming.stable,
  })

  // Fetch subjects
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects,
    isError: isSubjectsError,
    error: subjectsError,
  } = useQuery<Subject[]>({
    queryKey: queryKeys.scoreEntry.subjects(classTermId),
    queryFn: async () => {
      if (!classTermId) return []
      const result = await getSubjectsForClassTerm(classTermId)
      if (!result.success) throw new Error(result.error)
      return result.data ?? []
    },
    enabled: !!classTermId,
    staleTime: queryTiming.stable,
  })

  // Check teacher assignment when subject is selected
  const { data: teacherAssignment, isLoading: isLoadingTeacher } = useQuery({
    queryKey: queryKeys.scoreEntry.teacherAssignment(form.subjectId, classTermId),
    queryFn: async () => {
      if (!form.subjectId || !classTermId) return null
      const result = await checkTeacherAssignment(form.subjectId, classTermId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!form.subjectId && !!classTermId,
    staleTime: queryTiming.stable,
  })

  // NEW: Fetch assessments with enhanced status information
  const {
    data: assessmentData,
    isLoading: isLoadingAssessments,
    isError: isAssessmentsError,
    error: assessmentsError,
  } = useQuery({
    queryKey: queryKeys.scoreEntry.assessments(classTermId, form.subjectId, form.termId),
    queryFn: async () => {
      if (!classTermId || !form.subjectId || !form.termId) return null
      const result = await getAssessmentsWithStatus(classTermId, form.subjectId, form.termId)
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: !!classTermId && !!form.subjectId && !!form.termId,
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
      if (!form.termId || !form.subjectId) {
        throw new Error("Please select a term and subject")
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

      // No schoolId argument: the action derives the school from the term it is writing to,
      // so the client can no longer influence which tenant the scores land in.
      const result = await saveAssessments(assessmentsToSave, form.termId, form.subjectId)

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
        description: result.teacherInfo?.message,
      })

      await queryClient.invalidateQueries({
        queryKey: queryKeys.scoreEntry.assessments(classTermId, form.subjectId, form.termId),
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
      // Convert enhanced assessments to the format expected by useAssessmentState
      const formattedAssessments = assessments.map((assessment) => ({
        id: assessment.id,
        studentId: assessment.studentId,
        ca1: assessment.ca1,
        ca2: assessment.ca2,
        ca3: assessment.ca3,
        exam: assessment.exam,
        totalScore:
          (assessment.ca1 ?? 0) +
          (assessment.ca2 ?? 0) +
          (assessment.ca3 ?? 0) +
          (assessment.exam ?? 0),
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
        level: "",
        classId: "",
        subjectId: "",
      }))
      clearAll()
    },
    [clearAll],
  )

  const handleLevelChange = useCallback(
    (value: string) => {
      setForm((prev) => ({
        ...prev,
        level: value,
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
      totalScore:
          (assessment.ca1 ?? 0) +
          (assessment.ca2 ?? 0) +
          (assessment.ca3 ?? 0) +
          (assessment.exam ?? 0),
      grade: assessment.grade,
      remark: assessment.remark,
      isAbsent: assessment.isAbsent,
      isExempt: assessment.isExempt,
      isPublished: assessment.isPublished,
    }))
    resetScores(formattedAssessments)
    toast.info("Changes reset")
  }, [resetScores, assessments])

  // Save assessments
  const handleSave = useCallback(async () => {
    saveMutation.mutate()
  }, [saveMutation])

  // Handle query errors
  useEffect(() => {
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

  // Get selected items for display
  const selectedTerm = useMemo(() => terms.find((t) => t.id === form.termId), [terms, form.termId])
  const selectedClass = useMemo(() => classes.find((c) => c.id === form.classId), [classes, form.classId])
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === form.subjectId), [subjects, form.subjectId])

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
          <SelectionControls
            form={form}
            terms={terms}
            classLevels={classLevels}
            classes={classes}
            subjects={subjects}
            isLoadingClasses={isLoadingClasses}
            isLoadingSubjects={isLoadingSubjects}
            onTermChange={handleTermChange}
            onLevelChange={handleLevelChange}
            onClassChange={handleClassChange}
            onSubjectChange={handleSubjectChange}
          />
        </CardContent>
      </Card>

      {/* Teacher Assignment Alert */}
      {teacherAssignment && form.subjectId && (
        <Alert
          className={teacherAssignment.isAssigned ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}
        >
          {teacherAssignment.isAssigned ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription className={teacherAssignment.isAssigned ? "text-green-800" : "text-yellow-800"}>
            {teacherAssignment.message}
          </AlertDescription>
        </Alert>
      )}

      {/* NEW: Assessment Status Overview */}
      {assessmentStats && classTermId && form.subjectId && (
        <AssessmentStatusCard
          statistics={assessmentStats}
          classInfo={assessmentData?.classInfo}
          subjectName={selectedSubject?.name}
          subjectCode={selectedSubject?.code}
          isLoading={isLoadingAssessments}
        />
      )}

      {classTermId && form.subjectId && (
        <Card className="border shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Student Scores</CardTitle>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <span className="font-medium">School:</span> {schoolName} ({schoolCode})
              </div>
              <div>
                <span className="font-medium">Session:</span> {selectedTerm?.session.name || "-"}
              </div>
              <div>
                <span className="font-medium">Term:</span> {selectedTerm?.name || "-"}
              </div>
              <div>
                <span className="font-medium">Class:</span> {selectedClass?.name || "-"}
              </div>
              <div>
                <span className="font-medium">Subject:</span>{" "}
                {selectedSubject?.name ? `${selectedSubject.name} (${selectedSubject.code})` : "-"}
              </div>
              <div>
                <span className="font-medium">Teacher:</span>{" "}
                {isLoadingTeacher ? (
                  <Badge variant="outline" className="ml-1">
                    Checking...
                  </Badge>
                ) : teacherAssignment?.teacherName ? (
                  <Badge variant="outline" className="ml-1 bg-green-500/10 text-green-700 dark:text-green-400">
                    {teacherAssignment.teacherName}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                    Not Assigned
                  </Badge>
                )}
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
              assessmentData={assessments} // Pass the enhanced assessment data
            />
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
