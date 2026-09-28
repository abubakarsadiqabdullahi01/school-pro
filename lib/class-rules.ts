/**
 * What may be done to a class, and why not.
 *
 * A class sits at the top of a cascade that ends at student results —
 * `Class → ClassTerm → StudentClassTerm → Assessment`, every link CASCADE — so the
 * destructive actions here are the furthest-reaching in the app. Same shape as
 * `lib/term-rules.ts`: pure predicates the screen greys an action out with and the server
 * refuses on, so the two cannot drift.
 */

export type ClassVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: ClassVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a class may be deleted.
 *
 * The enrolments are what matter: a student's place in a class, their scores, their
 * enrolment history and both ends of every promotion they have been through all hang off
 * it. Scores are named separately in the reason because "and 480 results" is the number
 * that stops someone mid-click.
 */
export function canDeleteClass(facts: {
  enrolments: number
  recordedScores: number
  /** Fees already billed against this class's terms. */
  billedCharges: number
}): ClassVerdict {
  // Checked before enrolments, because a class whose students have since been moved away
  // can still carry the fees they were billed. The database refuses that delete anyway —
  // StudentCharge holds its fee schedule with onDelete: Restrict — but it refuses it as a
  // raw foreign-key error the screen reports as "Failed to delete class", which tells the
  // person nothing. Saying what is in the way is the whole difference.
  if (facts.billedCharges > 0) {
    return {
      allowed: false,
      reason:
        `${plural(facts.billedCharges, "fee charge", "fee charges")} have been billed against `
        + "this class's terms. They are part of the school's financial record and would have "
        + "to be cancelled first.",
    }
  }
  if (facts.enrolments === 0) {
    return ALLOWED
  }
  // "enrolment records", not "students": the count spans every term the class has run, so
  // one student who stayed for three terms is three records. The table's Students column
  // shows this term's roll, which is a different and smaller number.
  const enrolments = plural(facts.enrolments, "enrolment record", "enrolment records")
  return {
    allowed: false,
    reason:
      facts.recordedScores > 0
        ? `${enrolments} and ${plural(facts.recordedScores, "recorded result", "recorded results")} across this class's terms. Move the students to another class first.`
        : `${enrolments} across this class's terms. Move the students to another class first.`,
  }
}

/**
 * Whether a class name is free in the school.
 *
 * Two classes called "JSS 1A" is a mistake nothing else in the app can recover from —
 * every enrolment, score sheet and report card afterwards names a class the school can no
 * longer tell apart. Compared case-insensitively and trimmed, because "jss 1a " is the
 * same class to everyone except a database.
 */
export function canUseClassName(
  name: string,
  existingNames: readonly string[],
  editingName?: string | null,
): ClassVerdict {
  const candidate = name.trim().toLowerCase()
  if (!candidate) {
    return ALLOWED // Emptiness is the form's business, not this rule's.
  }
  if (editingName && candidate === editingName.trim().toLowerCase()) {
    return ALLOWED
  }
  if (existingNames.some((existing) => existing.trim().toLowerCase() === candidate)) {
    return { allowed: false, reason: "A class with this name already exists in this school." }
  }
  return ALLOWED
}

/**
 * Whether a class's section may still be changed.
 *
 * The section drives grading, the report card and the promotion rules. Moving a class from
 * Junior to Senior after it has been marked reinterprets results that have already been
 * released, so it is fixed once there are scores against it.
 */
export function canChangeClassLevel(facts: { recordedScores: number }): ClassVerdict {
  if (facts.recordedScores > 0) {
    return {
      allowed: false,
      reason: `${plural(facts.recordedScores, "result has", "results have")} been recorded for this class, and the section decides how they are graded.`,
    }
  }
  return ALLOWED
}
