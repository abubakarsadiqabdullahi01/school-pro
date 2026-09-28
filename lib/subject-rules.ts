/**
 * What may be done to a subject, and why not.
 *
 * Same shape as `lib/class-rules.ts`: pure predicates the screen greys an action out with
 * and the server refuses on, so a rule cannot be applied in one and forgotten in the other.
 */

export type SubjectVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: SubjectVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a subject may be deleted.
 *
 * Two separate reasons, and the second is the one that is easy to miss: a subject dropped
 * from the curriculum has no class assignment left and still holds every score ever
 * recorded against it, and `Assessment.subjectId` is CASCADE — so deleting it takes those
 * results with it.
 *
 * Teacher assignments are deliberately not a blocker. They are this term's timetable, they
 * carry nothing historical, and the server clears them as part of the delete.
 */
export function canDeleteSubject(facts: {
  classAssignments: number
  recordedScores: number
}): SubjectVerdict {
  if (facts.classAssignments > 0) {
    return {
      allowed: false,
      reason: `Taught in ${plural(facts.classAssignments, "class term", "class terms")}. Remove it from those classes first.`,
    }
  }
  if (facts.recordedScores > 0) {
    return {
      allowed: false,
      reason: `${plural(facts.recordedScores, "result has", "results have")} been recorded against this subject.`,
    }
  }
  return ALLOWED
}

/**
 * Whether a subject code is free in the school.
 *
 * The code is what appears on the report card and the score sheet, so two subjects sharing
 * one is not a cosmetic problem. Compared case-insensitively and trimmed.
 */
export function canUseSubjectCode(
  code: string,
  existingCodes: readonly string[],
  editingCode?: string | null,
): SubjectVerdict {
  const candidate = code.trim().toLowerCase()
  if (!candidate) return ALLOWED
  if (editingCode && candidate === editingCode.trim().toLowerCase()) return ALLOWED
  if (existingCodes.some((existing) => existing.trim().toLowerCase() === candidate)) {
    return { allowed: false, reason: "A subject with this code already exists in this school." }
  }
  return ALLOWED
}

/**
 * Whether a subject name is free in the school.
 *
 * The code was already guarded; the name was not, so "Mathematics/MTH" and
 * "Mathematics/MAT" could both exist and nothing downstream could tell a teacher which one
 * their scores belonged to.
 */
export function canUseSubjectName(
  name: string,
  existingNames: readonly string[],
  editingName?: string | null,
): SubjectVerdict {
  const candidate = name.trim().toLowerCase()
  if (!candidate) return ALLOWED
  if (editingName && candidate === editingName.trim().toLowerCase()) return ALLOWED
  if (existingNames.some((existing) => existing.trim().toLowerCase() === candidate)) {
    return { allowed: false, reason: "A subject with this name already exists in this school." }
  }
  return ALLOWED
}
