/**
 * Grading — the single implementation.
 *
 * This replaces five: this module's own previous version, `lib/assessment-calculations.ts`
 * (deleted, it was imported by nothing and used a different A–F scale), and a
 * `calculateGradeFromScore` copy in each of `compiler-improved.ts`,
 * `teacher-assessments.ts` and `teacher-compiler.ts`. The three copies agreed with each
 * other but not with this module, and none of them agreed with the class-term aggregation.
 *
 * Two rules, both learned from the bugs the old versions had:
 *
 *  1. **Floor before matching.** Bands are written on whole numbers, so a score of 79.9
 *     must grade as 79. The previous version compared the raw value, so 79.9 satisfied no
 *     band's upper bound, fell through every level, and hit a hardcoded `"F"` — a
 *     distinction-level mark reported as a fail, at every half-mark boundary.
 *  2. **Never invent a grade.** A score that matches no band returns `grade: null` and
 *     says so. Rendering "—" is honest; stamping an F is not.
 *
 * This module is deliberately pure — no Prisma, no `next/cache` — so it can be unit tested
 * and imported anywhere. The cached database load lives in `lib/grading.server.ts`.
 */

/**
 * The minimum needed to match a score to a letter. The class-term aggregation loads only
 * this much, because a result sheet shows grades without remarks.
 */
export interface ScoreBand {
  minScore: number
  maxScore: number
  grade: string
}

/** A full band as configured on a school's `GradingSystem`. Report cards print the remark. */
export interface GradeBand extends ScoreBand {
  remark: string
}

export interface GradingSystem {
  levels: GradeBand[]
  passMark: number
}

export interface GradeResult {
  /** Null when no band contains the score — render as unavailable, not as a fail. */
  grade: string | null
  remark: string
  passed: boolean
}

/**
 * Used only when a school has configured no grading system at all. WAEC-shaped, because
 * that is what Nigerian secondary schools grade against.
 *
 * Reaching this is a configuration gap, not a normal path, so `resolveGrade` logs when it
 * does. Previously three separate copies of these bands existed with no warning, which is
 * how a school could run a whole term on a scale nobody had chosen.
 */
export const FALLBACK_BANDS: GradeBand[] = [
  { minScore: 80, maxScore: 100, grade: "A1", remark: "Excellent" },
  { minScore: 70, maxScore: 79, grade: "A2", remark: "Very Good" },
  { minScore: 60, maxScore: 69, grade: "B1", remark: "Good" },
  { minScore: 50, maxScore: 59, grade: "B2", remark: "Fair" },
  { minScore: 45, maxScore: 49, grade: "C1", remark: "Pass" },
  { minScore: 40, maxScore: 44, grade: "C2", remark: "Weak Pass" },
  { minScore: 0, maxScore: 39, grade: "F9", remark: "Fail" },
]

export const FALLBACK_PASS_MARK = 40

/**
 * Matches a score to a band. Floors first — see rule 1 above.
 *
 * Returns null for a null score (nothing was entered) and for a score no band covers (the
 * school's bands have a gap). Those are different problems but the same answer: there is no
 * grade to show.
 */
export function matchBand<T extends ScoreBand>(
  score: number | null | undefined,
  bands: T[],
): T | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null

  const floored = Math.floor(score)
  return bands.find((band) => floored >= band.minScore && floored <= band.maxScore) ?? null
}

/** The letter only. Convenience for the class-term aggregation, which renders just a grade. */
export function gradeForScore(score: number | null | undefined, bands: ScoreBand[]): string | null {
  return matchBand(score, bands)?.grade ?? null
}

/**
 * Resolves a score against a school's grading system.
 *
 * `passed` is judged against the school's pass mark, not against the band letter — a school
 * may well have a band whose letter looks like a pass but sits below its own threshold.
 */
export function resolveGrade(
  score: number | null | undefined,
  system: GradingSystem | null | undefined,
): GradeResult {
  const hasConfiguredBands = Boolean(system?.levels?.length)

  if (!hasConfiguredBands) {
    console.warn(
      "No grading system configured for this school — falling back to the built-in WAEC scale. " +
        "Configure one at /dashboard/admin/school-settings/grading-systems.",
    )
  }

  const bands = hasConfiguredBands ? system!.levels : FALLBACK_BANDS
  const passMark = system?.passMark ?? FALLBACK_PASS_MARK

  const band = matchBand(score, bands)
  const passed = score !== null && score !== undefined && score >= passMark

  if (!band) {
    return { grade: null, remark: "Grade unavailable", passed }
  }

  return { grade: band.grade, remark: band.remark, passed }
}

/**
 * Retained name for the three action files that already call it. Identical to
 * `resolveGrade`; prefer that in new code.
 */
export const calculateGrade = resolveGrade

/** Percentage of scores at or above the pass mark. Zero for an empty class, not NaN. */
export function getPassRate(scores: number[], passMark: number): number {
  if (scores.length === 0) return 0
  return (scores.filter((score) => score >= passMark).length / scores.length) * 100
}

export function isPassing(score: number, passMark: number): boolean {
  return score >= passMark
}
