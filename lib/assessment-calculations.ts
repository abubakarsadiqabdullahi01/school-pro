import { GradingSystem } from '@/lib/grading'

export interface AssessmentScore {
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
  isAbsent: boolean
  isExempt: boolean
}

export interface CalculatedAssessment extends AssessmentScore {
  totalCA: number | null
  total: number | null
  grade: string | null
  isComplete: boolean
}

export function calculateAssessmentTotals(score: AssessmentScore): CalculatedAssessment {
  if (score.isAbsent || score.isExempt) {
    return {
      ...score,
      totalCA: null,
      total: null,
      grade: null,
      isComplete: false,
    }
  }

  // Check if all scores are entered
  const hasAllScores = 
    score.ca1 !== null && 
    score.ca2 !== null && 
    score.ca3 !== null && 
    score.exam !== null

  if (!hasAllScores) {
    return {
      ...score,
      totalCA: null,
      total: null,
      grade: null,
      isComplete: false,
    }
  }

  // Calculate totals
  const totalCA = (score.ca1 || 0) + (score.ca2 || 0) + (score.ca3 || 0)
  const total = totalCA + (score.exam || 0)

  // Calculate grade (using default grading system)
  const grade = calculateGrade(total)

  return {
    ...score,
    totalCA,
    total,
    grade,
    isComplete: true,
  }
}

export function calculateGrade(total: number): string {
  if (total >= 70) return 'A'
  if (total >= 60) return 'B'
  if (total >= 50) return 'C'
  if (total >= 45) return 'D'
  if (total >= 40) return 'E'
  return 'F'
}

// Batch calculate for performance
export function batchCalculateAssessments(
  assessments: AssessmentScore[]
): CalculatedAssessment[] {
  return assessments.map(calculateAssessmentTotals)
}