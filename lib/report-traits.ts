/**
 * The affective and psychomotor traits printed on the report sheet.
 *
 * Both domains were already drawn on the report card, with hardcoded traits and
 * a dash where every rating should be. This is the real list, and the one place
 * it is defined: the entry grid, the validation and the PDF all read from here,
 * so a trait cannot appear in one and be missing from another.
 *
 * Stored by code rather than by label. A school that later wants "Politeness"
 * printed as "Courtesy" changes the label here; the ratings already recorded
 * keep pointing at the same trait.
 */

export type TraitDomain = "AFFECTIVE" | "PSYCHOMOTOR"

export type ReportTrait = {
  code: string
  label: string
  domain: TraitDomain
}

/** Printed in this order, which is the order the school asked for. */
export const REPORT_TRAITS: readonly ReportTrait[] = [
  { code: "CLASS_ATTENDANCE", label: "Class Attendance", domain: "AFFECTIVE" },
  { code: "HONESTY", label: "Honesty", domain: "AFFECTIVE" },
  { code: "LEADERSHIP", label: "Leadership", domain: "AFFECTIVE" },
  { code: "NEATNESS", label: "Neatness", domain: "AFFECTIVE" },
  { code: "POLITENESS", label: "Politeness", domain: "AFFECTIVE" },
  { code: "PUNCTUALITY", label: "Punctuality", domain: "AFFECTIVE" },
  { code: "GAMES", label: "Games", domain: "PSYCHOMOTOR" },
  { code: "VERBAL_FLUENCY", label: "Verbal Fluency", domain: "PSYCHOMOTOR" },
  { code: "HANDWRITING", label: "Handwriting", domain: "PSYCHOMOTOR" },
  { code: "MUSICAL_SKILL", label: "Musical Skill", domain: "PSYCHOMOTOR" },
  { code: "HANDLING_TOOLS", label: "Handling Tools", domain: "PSYCHOMOTOR" },
] as const

export const AFFECTIVE_TRAITS = REPORT_TRAITS.filter((trait) => trait.domain === "AFFECTIVE")
export const PSYCHOMOTOR_TRAITS = REPORT_TRAITS.filter((trait) => trait.domain === "PSYCHOMOTOR")

export const MIN_RATING = 1
export const MAX_RATING = 5

/** What each number means. Printed as a key beside the two tables. */
export const RATING_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Very Good",
  3: "Good",
  2: "Fair",
  1: "Poor",
}

/** The key as it appears under the domain tables. */
export const RATING_KEY = "5 = Excellent · 4 = Very Good · 3 = Good · 2 = Fair · 1 = Poor"

const BY_CODE = new Map(REPORT_TRAITS.map((trait) => [trait.code, trait]))

export function findTrait(code: string): ReportTrait | undefined {
  return BY_CODE.get(code)
}

export function traitLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code
}

export function isTraitCode(code: string): boolean {
  return BY_CODE.has(code)
}

/**
 * A rating is a whole number from 1 to 5.
 *
 * Deliberately strict: a 0, a 6 or a 4.5 on a report sheet is a data-entry slip,
 * and silently clamping it would print a mark the teacher never gave.
 */
export function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_RATING && value <= MAX_RATING
}

/**
 * Lays recorded ratings out for printing: every trait in the domain, in order,
 * with the rating or null where the teacher has not filled one in.
 *
 * The report card prints a dash for a null rather than leaving the row out — a
 * missing row reads as though the school does not assess that trait, while a
 * dash reads as "not filled in", which is what actually happened.
 */
export function ratingsForDomain(
  domain: TraitDomain,
  recorded: ReadonlyArray<{ trait: string; rating: number }>,
): Array<{ code: string; label: string; rating: number | null }> {
  const byCode = new Map(recorded.map((row) => [row.trait, row.rating]))

  return REPORT_TRAITS.filter((trait) => trait.domain === domain).map((trait) => ({
    code: trait.code,
    label: trait.label,
    rating: byCode.get(trait.code) ?? null,
  }))
}
