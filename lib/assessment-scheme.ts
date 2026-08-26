/**
 * How a school splits a subject's marks.
 *
 * This replaces literals that were compiled into three separate action files:
 * `validateScore(assessment.ca1, "CA1", 10)` and `validateScore(assessment.exam, "Exam", 70)`.
 * Bounds were properly enforced server-side — but only ever for that one scheme, so a
 * school on 40/60 or with two CAs could not be onboarded without editing the source.
 *
 * Pure by design, so the rules can be unit tested. The cached database load lives in
 * `lib/assessment-scheme.server.ts`.
 */

export type SchemeComponentKey = "ca1" | "ca2" | "ca3" | "exam"

export interface AssessmentScheme {
  name: string
  ca1Max: number
  ca2Max: number
  ca3Max: number
  examMax: number
}

export interface SchemeComponent {
  key: SchemeComponentKey
  /** What a teacher sees above the column. */
  label: string
  max: number
}

/**
 * What every school got before this was configurable. Still the default for a new school,
 * because it is what Nigerian secondary schools overwhelmingly use — but now a starting
 * point rather than a rule.
 */
export const DEFAULT_ASSESSMENT_SCHEME: AssessmentScheme = {
  name: "Three CAs and an exam",
  ca1Max: 10,
  ca2Max: 10,
  ca3Max: 10,
  examMax: 70,
}

const LABELS: Record<SchemeComponentKey, string> = {
  ca1: "CA1",
  ca2: "CA2",
  ca3: "CA3",
  exam: "Exam",
}

/** The marks a subject is out of under this scheme. */
export function schemeTotal(scheme: AssessmentScheme): number {
  return scheme.ca1Max + scheme.ca2Max + scheme.ca3Max + scheme.examMax
}

/**
 * The components actually in use, in entry order.
 *
 * A maximum of 0 means the slot is unused — that is how a two-CA school is expressed
 * without changing the four fixed score columns on `Assessment`. Score-entry screens should
 * render only these.
 */
export function schemeComponents(scheme: AssessmentScheme): SchemeComponent[] {
  return (["ca1", "ca2", "ca3", "exam"] as const)
    .map((key) => ({ key, label: LABELS[key], max: scheme[`${key}Max`] }))
    .filter((component) => component.max > 0)
}

/**
 * Validates a scheme an administrator has just entered. Returns messages to show them, in
 * their own terms — an empty array means the scheme is usable.
 */
export function validateScheme(scheme: AssessmentScheme): string[] {
  const problems: string[] = []

  if (!scheme.name.trim()) {
    problems.push("Give the scheme a name, so staff know which one is in use.")
  }

  for (const key of ["ca1", "ca2", "ca3", "exam"] as const) {
    const max = scheme[`${key}Max`]

    if (!Number.isInteger(max)) {
      problems.push(`${LABELS[key]} must be a whole number.`)
    } else if (max < 0) {
      problems.push(`${LABELS[key]} cannot be negative. Use 0 if it is not used.`)
    } else if (max > 100) {
      problems.push(`${LABELS[key]} cannot be more than 100.`)
    }
  }

  const total = schemeTotal(scheme)

  if (total <= 0) {
    problems.push("At least one component needs a mark above 0.")
  } else if (total > 100) {
    problems.push(
      `These add up to ${total}. A subject cannot be marked out of more than 100 — ` +
        "reduce one of the components.",
    )
  }

  return problems
}

export interface ScoreSet {
  ca1?: number | null
  ca2?: number | null
  ca3?: number | null
  exam?: number | null
}

/**
 * Throws if any score falls outside what the scheme allows.
 *
 * A score entered against an unused component (maximum 0) is rejected too — that is a
 * screen offering a column the school does not use, which is worth surfacing rather than
 * silently storing.
 */
export function assertScoresWithinScheme(scores: ScoreSet, scheme: AssessmentScheme): void {
  for (const key of ["ca1", "ca2", "ca3", "exam"] as const) {
    const value = scores[key]
    if (value === null || value === undefined) continue

    const max = scheme[`${key}Max`]

    if (max === 0) {
      throw new Error(
        `${LABELS[key]} is not used under this school's assessment scheme, ` +
          `but a score of ${value} was submitted.`,
      )
    }

    if (Number.isNaN(value) || value < 0 || value > max) {
      throw new Error(`${LABELS[key]} score must be between 0 and ${max}, got ${value}`)
    }
  }
}
