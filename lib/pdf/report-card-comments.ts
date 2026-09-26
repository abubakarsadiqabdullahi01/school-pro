/**
 * What the comments box on a report card says.
 *
 * Extracted from the PDF generator because it is the one part of that file worth testing.
 * Everything else there places rectangles and text on a page; this decides what a parent
 * reads about whether their child goes up a year, and it should not need a human to open
 * a PDF to find out whether it is right.
 *
 * Pure, and deliberately knows nothing about jsPDF.
 */

export type AnnualCardDecision = "PENDING" | "PROMOTED" | "REPEATED" | "GRADUATED"

/** Printed when a decision was approved but nobody wrote a comment of their own. */
export const DECISION_SENTENCE: Record<Exclude<AnnualCardDecision, "PENDING">, string> = {
  PROMOTED: "Promoted to the next class.",
  REPEATED: "To repeat the class.",
  GRADUATED: "Has completed the programme.",
}

/** The stamp in the corner of the comments box. Short enough to read at a glance. */
export const DECISION_STAMP: Record<Exclude<AnnualCardDecision, "PENDING">, string> = {
  PROMOTED: "PROMOTED",
  REPEATED: "REPEAT",
  GRADUATED: "GRADUATED",
}

export type CommentInput = {
  averageScore: number
  /** Absent or PENDING on a termly card, and on a session nobody has approved yet. */
  annualDecision?: AnnualCardDecision
  principalComment?: string
}

export type CardComments = {
  formTeacher: string
  headTeacher: string
  /** The corner stamp, or null when there is no approved outcome to stamp. */
  stamp: string | null
}

/** The class teacher's line. Generated from the average; there is nowhere to type one. */
function formTeacherComment(average: number): string {
  if (average >= 70) return "Very Good Result, Well done!"
  if (average >= 60) return "Good Result, Keep it up!"
  if (average >= 50) return "Fair Result, Work harder."
  return "Poor Result, Much more effort required."
}

/** The encouragement printed when no end-of-session decision has been approved. */
function generatedHeadComment(average: number): string {
  if (average >= 70) return "Very Good Result, Forward!"
  if (average >= 60) return "Good Result, Keep improving!"
  if (average >= 50) return "Average Result, Try harder next term."
  return "Below Average, Significant improvement needed."
}

/**
 * The head teacher's line is where the annual outcome belongs — it is the line the update
 * document meant by "Promotion or Repeated as Principal Comment".
 *
 * Three cases, in order of authority:
 *
 *   1. An approved decision and the principal's own words  -> print those words.
 *   2. An approved decision and no words                   -> print the outcome alone.
 *   3. No approved decision                                -> the generated encouragement,
 *      exactly as the card printed before any of this existed.
 *
 * Case 3 is why `annualDecision` is optional rather than required: a termly card has no
 * end-of-session outcome, and must not start claiming one.
 */
export function reportCardComments(student: CommentInput): CardComments {
  const decided =
    student.annualDecision !== undefined && student.annualDecision !== "PENDING"
      ? student.annualDecision
      : null

  return {
    formTeacher: formTeacherComment(student.averageScore),
    headTeacher: decided
      ? // A comment of only spaces is not a comment. Falling through to the outcome is
        // better than printing a blank line where the decision should be.
        student.principalComment?.trim() || DECISION_SENTENCE[decided]
      : generatedHeadComment(student.averageScore),
    stamp: decided ? DECISION_STAMP[decided] : null,
  }
}
