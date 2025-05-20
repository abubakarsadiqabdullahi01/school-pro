/**
 * Utility functions for working with grading systems
 */

// Define the types for grading system
export interface GradingLevel {
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
}

export interface GradingSystem {
  levels: GradingLevel[];
  passMark: number;
}

// Calculate grade based on score and grading system
export function calculateGrade(score: number, gradingSystem: GradingSystem) {
  if (!gradingSystem || !gradingSystem.levels || gradingSystem.levels.length === 0) {
    return null
  }

  // Sort levels by maxScore in descending order
  const sortedLevels = [...gradingSystem.levels].sort((a, b) => b.maxScore - a.maxScore)

  // Find the appropriate grade level
  for (const level of sortedLevels) {
    if (score >= level.minScore && score <= level.maxScore) {
      return {
        grade: level.grade,
        remark: level.remark,
        passed: score >= gradingSystem.passMark,
      }
    }
  }

  return null
}

// Get grade color based on grade
export function getGradeColor(grade: string) {
  // First character of grade is usually the letter grade (A, B, C, etc.)
  const letterGrade = grade.charAt(0).toUpperCase()

  switch (letterGrade) {
    case "A":
      return "bg-green-100 text-green-800"
    case "B":
      return "bg-blue-100 text-blue-800"
    case "C":
      return "bg-yellow-100 text-yellow-800"
    case "D":
      return "bg-orange-100 text-orange-800"
    case "E":
      return "bg-orange-100 text-orange-800"
    case "F":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

// Format score as percentage
export function formatScore(score: number) {
  return `${score.toFixed(1)}%`
}

// Check if a score is a passing score
export function isPassing(score: number, passMark: number) {
  return score >= passMark
}

// Get pass rate from an array of scores
export function getPassRate(scores: number[], passMark: number) {
  if (scores.length === 0) return 0

  const passCount = scores.filter((score) => score >= passMark).length
  return (passCount / scores.length) * 100
}
