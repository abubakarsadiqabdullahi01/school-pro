/**
 * Whether a parent or learner may see a set of results.
 *
 * Two independent gates, and they answer different questions:
 *
 *   1. Has the school released the marks? That is `isPublished` on the assessment, applied
 *      as `PUBLISHED_ONLY` at the query. A teacher's working draft is nobody else's
 *      business, and no setting turns that off.
 *   2. Has the family paid for that period? That is this module. Some schools hold results
 *      against an unpaid balance and some consider it unfair, so it is a switch each school
 *      sets for itself rather than a rule baked into the product.
 *
 * Gate 2 is per period, not per account. A family that owes for this term but paid for the
 * last two keeps last year's results: the school is withholding the thing that has not been
 * paid for, not erasing history. Getting that wrong would make the sessional summary
 * disappear every time a new term's bill was raised.
 *
 * Pure functions, no database, so the portal and any printed sheet ask the same question
 * and cannot drift.
 */

export type ResultAccess = { allowed: true } | { allowed: false; reason: string }

export interface WithholdingInput {
  /** The school's `withholdResultsWhenOwing` setting. */
  withholdEnabled: boolean
  /** What is still owing for this period. Negative or zero means nothing is owed. */
  balanceOwing: number
  /** Names the period in the message a parent reads, e.g. "First Term, 2025/2026". */
  periodLabel?: string
}

export function canViewResults({
  withholdEnabled,
  balanceOwing,
  periodLabel,
}: WithholdingInput): ResultAccess {
  if (!withholdEnabled) return { allowed: true }
  if (!(balanceOwing > 0)) return { allowed: true }

  const where = periodLabel ? ` for ${periodLabel}` : ""
  return {
    allowed: false,
    // Says what to do about it. "Access denied" leaves a parent with nowhere to go.
    reason:
      `These results are held until the fees${where} are settled. ` +
      `Please contact the school bursar.`,
  }
}

/**
 * The session summary is visible only when every term in it is.
 *
 * A cumulative average computed from two of three terms is not a smaller truth, it is a
 * different and wrong number — and a parent shown 61% would have no way to tell it was
 * missing the term they had not paid for.
 */
export function canViewSessionSummary(
  terms: ReadonlyArray<{ access: ResultAccess; termName: string }>,
): ResultAccess {
  const held = terms.filter((term) => !term.access.allowed)
  if (held.length === 0) return { allowed: true }

  const names = held.map((term) => term.termName).join(", ")
  return {
    allowed: false,
    reason:
      `The session summary needs every term. ${names} ` +
      `${held.length === 1 ? "is" : "are"} held until the fees are settled.`,
  }
}
