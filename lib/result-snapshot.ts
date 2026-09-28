import type { GradingSystem } from "@/lib/grading"

/** Safely reads a frozen grading policy stored with a published result workflow. */
export function gradingSystemFromSnapshot(value: unknown): GradingSystem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const snapshot = value as Record<string, unknown>
  if (typeof snapshot.passMark !== "number" || !Array.isArray(snapshot.levels)) return null

  const levels = snapshot.levels.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const level = entry as Record<string, unknown>
    if (
      typeof level.minScore !== "number" ||
      typeof level.maxScore !== "number" ||
      typeof level.grade !== "string" ||
      typeof level.remark !== "string"
    ) return []
    return [{
      minScore: level.minScore,
      maxScore: level.maxScore,
      grade: level.grade,
      remark: level.remark,
    }]
  })

  return levels.length === snapshot.levels.length
    ? { passMark: snapshot.passMark, levels }
    : null
}
