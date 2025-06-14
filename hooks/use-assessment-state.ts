"use client"

import { useReducer, useCallback } from "react"
import type { ScoreEntry, Assessment, Student } from "../components/score-entry/types"

type Action =
  | { type: "INIT_SCORES"; payload: { students: Student[]; assessments: Assessment[] } }
  | { type: "UPDATE_SCORE"; payload: { studentId: string; field: keyof ScoreEntry; value: any } }
  | { type: "BATCH_UPDATE"; payload: { updates: Record<string, Partial<ScoreEntry>> } }
  | { type: "RESET_SCORES"; payload: { assessments: Assessment[] } }
  | { type: "MARK_SAVED"; payload: { studentIds: string[]; assessmentIds: Record<string, string> } }
  | { type: "SET_ERROR"; payload: { studentId: string; error: string | null } }
  | { type: "CLEAR_ALL" }

interface State {
  scores: Record<string, ScoreEntry>
  hasChanges: boolean
  errorCount: number
  initialized: boolean
}

// Safe calculation functions
function calculateTotal(
  ca1: number | null,
  ca2: number | null,
  ca3: number | null,
  exam: number | null,
): number | null {
  // If student is absent or exempt, don't calculate
  // Only calculate if at least one score is provided and > 0
  const scores = [ca1, ca2, ca3, exam].filter((score) => score !== null && score !== undefined)
  if (scores.length === 0) return null

  // Sum all scores (including 0s)
  return (ca1 || 0) + (ca2 || 0) + (ca3 || 0) + (exam || 0)
}

function calculateGrade(total: number | null): string | null {
  if (total === null || total === undefined) return null

  if (total >= 70) return "A"
  if (total >= 60) return "B"
  if (total >= 50) return "C"
  if (total >= 45) return "D"
  if (total >= 40) return "E"
  return "F"
}

function validateScore(field: string, value: number | null): { isValid: boolean; error?: string } {
  if (value === null || value === undefined) return { isValid: true }

  if (isNaN(value) || value < 0) {
    return { isValid: false, error: "Score must be a positive number" }
  }

  const maxScores = {
    ca1: 10,
    ca2: 10,
    ca3: 10,
    exam: 70,
  }

  const maxScore = maxScores[field as keyof typeof maxScores] || 100
  if (value > maxScore) {
    return { isValid: false, error: `Score cannot exceed ${maxScore}` }
  }

  return { isValid: true }
}

function assessmentReducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT_SCORES": {
      const newScores: Record<string, ScoreEntry> = {}
      const { students, assessments } = action.payload

      students.forEach((student) => {
        const assessment = assessments.find((a) => a.studentId === student.id)
        newScores[student.id] = {
          id: assessment?.id,
          studentId: student.id,
          ca1: assessment?.ca1 ?? 0,
          ca2: assessment?.ca2 ?? 0,
          ca3: assessment?.ca3 ?? 0,
          exam: assessment?.exam ?? 0,
          totalScore: assessment?.totalScore ?? null,
          grade: assessment?.grade ?? null,
          remark: assessment?.remark ?? null,
          isAbsent: assessment?.isAbsent ?? false,
          isExempt: assessment?.isExempt ?? false,
          isPublished: assessment?.isPublished ?? false,
          isDirty: false,
          hasError: false,
        }
      })

      return {
        scores: newScores,
        hasChanges: false,
        errorCount: 0,
        initialized: true,
      }
    }

    case "UPDATE_SCORE": {
      const { studentId, field, value } = action.payload
      const currentScore = state.scores[studentId]

      if (!currentScore) return state

      // Validate the score
      const validation = validateScore(field, value)

      const updatedScore = {
        ...currentScore,
        [field]: value,
        isDirty: true,
        hasError: !validation.isValid,
        errorMessage: validation.error,
      }

      // Recalculate totals if not absent or exempt
      if (!updatedScore.isAbsent && !updatedScore.isExempt && validation.isValid) {
        updatedScore.totalScore = calculateTotal(
          updatedScore.ca1,
          updatedScore.ca2,
          updatedScore.ca3,
          updatedScore.exam,
        )
        updatedScore.grade = calculateGrade(updatedScore.totalScore)
      }

      const newScores = { ...state.scores, [studentId]: updatedScore }
      const hasChanges = Object.values(newScores).some((s) => s.isDirty)
      const errorCount = Object.values(newScores).filter((s) => s.hasError).length

      return { ...state, scores: newScores, hasChanges, errorCount }
    }

    case "BATCH_UPDATE": {
      const newScores = { ...state.scores }

      Object.entries(action.payload.updates).forEach(([studentId, updates]) => {
        if (newScores[studentId]) {
          newScores[studentId] = { ...newScores[studentId], ...updates }
        }
      })

      const hasChanges = Object.values(newScores).some((s) => s.isDirty)
      const errorCount = Object.values(newScores).filter((s) => s.hasError).length

      return { ...state, scores: newScores, hasChanges, errorCount }
    }

    case "RESET_SCORES": {
      const newScores = { ...state.scores }

      Object.keys(newScores).forEach((studentId) => {
        const assessment = action.payload.assessments.find((a) => a.studentId === studentId)
        newScores[studentId] = {
          ...newScores[studentId],
          ca1: assessment?.ca1 ?? 0,
          ca2: assessment?.ca2 ?? 0,
          ca3: assessment?.ca3 ?? 0,
          exam: assessment?.exam ?? 0,
          totalScore: assessment?.totalScore ?? null,
          grade: assessment?.grade ?? null,
          remark: assessment?.remark ?? null,
          isAbsent: assessment?.isAbsent ?? false,
          isExempt: assessment?.isExempt ?? false,
          isDirty: false,
          hasError: false,
          errorMessage: undefined,
        }
      })

      return { ...state, scores: newScores, hasChanges: false, errorCount: 0 }
    }

    case "MARK_SAVED": {
      const newScores = { ...state.scores }
      const { studentIds, assessmentIds } = action.payload

      studentIds.forEach((studentId) => {
        if (newScores[studentId]) {
          newScores[studentId] = {
            ...newScores[studentId],
            isDirty: false,
            id: assessmentIds[studentId] || newScores[studentId].id,
          }
        }
      })

      const hasChanges = Object.values(newScores).some((s) => s.isDirty)

      return { ...state, scores: newScores, hasChanges, errorCount: state.errorCount }
    }

    case "SET_ERROR": {
      const newScores = { ...state.scores }

      if (newScores[action.payload.studentId]) {
        newScores[action.payload.studentId] = {
          ...newScores[action.payload.studentId],
          hasError: !!action.payload.error,
          errorMessage: action.payload.error || undefined,
        }
      }

      const errorCount = Object.values(newScores).filter((s) => s.hasError).length

      return { ...state, scores: newScores, errorCount }
    }

    case "CLEAR_ALL": {
      return {
        scores: {},
        hasChanges: false,
        errorCount: 0,
        initialized: false,
      }
    }

    default:
      return state
  }
}

export function useAssessmentState() {
  const [state, dispatch] = useReducer(assessmentReducer, {
    scores: {},
    hasChanges: false,
    errorCount: 0,
    initialized: false,
  })

  const initializeScores = useCallback((students: Student[], assessments: Assessment[]) => {
    dispatch({ type: "INIT_SCORES", payload: { students, assessments } })
  }, [])

  const updateScore = useCallback((studentId: string, field: keyof ScoreEntry, value: any) => {
    dispatch({ type: "UPDATE_SCORE", payload: { studentId, field, value } })
  }, [])

  const batchUpdate = useCallback((updates: Record<string, Partial<ScoreEntry>>) => {
    dispatch({ type: "BATCH_UPDATE", payload: { updates } })
  }, [])

  const resetScores = useCallback((assessments: Assessment[]) => {
    dispatch({ type: "RESET_SCORES", payload: { assessments } })
  }, [])

  const markSaved = useCallback((studentIds: string[], assessmentIds: Record<string, string>) => {
    dispatch({ type: "MARK_SAVED", payload: { studentIds, assessmentIds } })
  }, [])

  const setError = useCallback((studentId: string, error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: { studentId, error } })
  }, [])

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" })
  }, [])

  return {
    scores: state.scores,
    hasChanges: state.hasChanges,
    errorCount: state.errorCount,
    initialized: state.initialized,
    initializeScores,
    updateScore,
    batchUpdate,
    resetScores,
    markSaved,
    setError,
    clearAll,
  }
}
