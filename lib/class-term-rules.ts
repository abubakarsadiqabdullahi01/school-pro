/**
 * What may be done to a class term, and why not.
 *
 * A class term is where a class, a roll of students, a set of subjects and a term's scores
 * all meet, so the destructive actions around it are the ones most able to quietly lose
 * work. The rules live here as pure functions for the same reason the term rules do: the
 * screen can grey an action out with its reason, and the server can refuse it, without the
 * two drifting apart.
 */

export type ClassTermVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: ClassTermVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a class may be taken off a term.
 *
 * Both counts matter, and for different reasons. Students on the roll would lose their
 * place in the term; recorded scores would lose the class they belong to. The old
 * implementation checked the roll — but only *after* it had already deleted the class's
 * subject assignments, so refusing still cost the school its subject list.
 */
export function canRemoveClassFromTerm(facts: {
  enrolledStudents: number
  recordedScores: number
}): ClassTermVerdict {
  if (facts.enrolledStudents > 0) {
    return {
      allowed: false,
      reason:
        `${plural(facts.enrolledStudents, "student is", "students are")} enrolled in this class ` +
        "for this term. Move or withdraw them first.",
    }
  }
  if (facts.recordedScores > 0) {
    return {
      allowed: false,
      reason:
        `${plural(facts.recordedScores, "score has", "scores have")} been recorded against this ` +
        "class for this term.",
    }
  }
  return ALLOWED
}

/**
 * Whether a subject may be taken off a class term.
 *
 * Unticking a subject that has been marked does not delete the scores, but it does remove
 * the subject from the class — so the scores stop appearing on the entry sheet and on the
 * report card, with nothing to say where they went.
 */
export function canRemoveSubjectFromClassTerm(facts: { recordedScores: number }): ClassTermVerdict {
  if (facts.recordedScores > 0) {
    return {
      allowed: false,
      reason: `${plural(facts.recordedScores, "score", "scores")} already recorded this term.`,
    }
  }
  return ALLOWED
}
