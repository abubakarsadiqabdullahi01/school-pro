/**
 * Utility functions for working with grading systems
 */

export interface GradingLevel {
  minScore: number
  maxScore: number
  grade: string
  remark: string
}

export interface GradingSystem {
  levels: GradingLevel[]
  passMark: number
}

export function calculateGrade(score: number, gradingSystem: GradingSystem) {
  if (!gradingSystem || !gradingSystem.levels || gradingSystem.levels.length === 0) {
    // Default grading if no system provided
    if (score >= 70) return { grade: "A", remark: "Excellent", passed: true }
    if (score >= 60) return { grade: "B", remark: "Very Good", passed: true }
    if (score >= 50) return { grade: "C", remark: "Good", passed: true }
    if (score >= 45) return { grade: "D", remark: "Fair", passed: true }
    if (score >= 40) return { grade: "E", remark: "Pass", passed: true }
    return { grade: "F", remark: "Fail", passed: false }
  }

  const sortedLevels = [...gradingSystem.levels].sort((a, b) => b.maxScore - a.maxScore)
  for (const level of sortedLevels) {
    if (score >= level.minScore && score <= level.maxScore) {
      return {
        grade: level.grade,
        remark: level.remark,
        passed: score >= gradingSystem.passMark,
      }
    }
  }

  return { grade: "F", remark: "Fail", passed: false }
}

export function getGradeColor(grade: string) {
  const letterGrade = grade.charAt(0).toUpperCase()
  switch (letterGrade) {
    case "A":
      return "bg-green-100 text-green-800"
    case "B":
      return "bg-blue-100 text-blue-800"
    case "C":
      return "bg-yellow-100 text-yellow-800"
    case "D":
    case "E":
      return "bg-orange-100 text-orange-800"
    case "F":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

export function formatScore(score: number) {
  return `${score.toFixed(1)}%`
}

export function isPassing(score: number, passMark: number) {
  return score >= passMark
}

export function getPassRate(scores: number[], passMark: number) {
  if (scores.length === 0) return 0
  const passCount = scores.filter((score) => score >= passMark).length
  return (passCount / scores.length) * 100
}