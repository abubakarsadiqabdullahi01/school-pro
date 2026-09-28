/**
 * What may be done to an expense category, and why not.
 *
 * A category is the label on a voucher and the heading a termly budget is set against, and
 * `Expense.category` is RESTRICT so the label cannot be deleted out from under a paid
 * voucher. Retiring is what is meant nearly every time: it takes the category off the
 * expenditure form and leaves every past voucher reading exactly as it did.
 *
 * Same shape as the payment-account rules: pure predicates the screen greys an action out
 * with and the server refuses on, so the two cannot drift.
 */

export type CategoryVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: CategoryVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a name is free.
 *
 * `ExpenseCategory` is unique on (school, name), so a clash is a constraint error on submit
 * unless it is caught as it is typed. Compared case-insensitively and trimmed, because
 * "School Activities" and "school activities " are the same heading to everyone but the
 * database.
 */
export function canUseExpenseCategoryName(
  name: string,
  taken: Array<{ id: string; name: string }>,
  selfId?: string,
): CategoryVerdict {
  const trimmed = name.trim()

  if (trimmed.length < 2) {
    return { allowed: false, reason: "Give the category a name of at least two characters." }
  }

  const clash = taken.find(
    (entry) => entry.id !== selfId && entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) {
    return { allowed: false, reason: `${clash.name} already exists. Category names must be distinct.` }
  }

  return ALLOWED
}

/**
 * What to say when retiring, or null when there is nothing in flight.
 *
 * Retiring is never refused — it only takes the category off the form for new spending. But
 * vouchers already moving through approval keep the retired label all the way to payment,
 * and somebody retiring a category mid-term should know that before they do it.
 */
export function retireNote(facts: { unpaidExpenseCount: number }): string | null {
  if (facts.unpaidExpenseCount === 0) return null

  return `${plural(
    facts.unpaidExpenseCount,
    "voucher is",
    "vouchers are",
  )} still going through approval under this category. They keep it, and can still be approved and paid.`
}

/**
 * Whether a category may be deleted.
 *
 * Only one nothing has ever been charged to. Every voucher carries its category as the
 * heading it is reported under, so deleting one that has been used either fails at the
 * database or blanks out what past spending was for. Retiring is the answer in every other
 * case.
 */
export function canDeleteExpenseCategory(facts: { expenseCount: number }): CategoryVerdict {
  if (facts.expenseCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `${plural(
      facts.expenseCount,
      "voucher reports",
      "vouchers report",
    )} under this category. Deleting it would blank out what that spending was for. Retire it instead.`,
  }
}

/**
 * What a change to the termly ceiling means for the term already under way.
 *
 * A limit is reported against, never enforced, so lowering one below what has already been
 * spent is allowed — but it turns the category over-budget the moment it is saved, and that
 * should be said before saving rather than discovered on the dashboard.
 */
export function budgetLimitWarning(
  next: string | number | null,
  spentThisTerm: string | number,
): string | null {
  if (next === null || next === "") return null

  const ceiling = Number(next)
  const spent = Number(spentThisTerm)
  if (!Number.isFinite(ceiling) || ceiling === 0 || spent <= ceiling) return null

  return `This term has already spent more than that. The category will report as over budget straight away.`
}
