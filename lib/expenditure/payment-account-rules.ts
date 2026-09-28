/**
 * What may be done to a payment account, and why not.
 *
 * An account is not a row in a list — it is the answer to "where did that money leave from",
 * and `Expense.account` is RESTRICT so the answer cannot be deleted out from under a paid
 * voucher. Salary payments point at one too, and staff records name a default account to be
 * paid from, so three different things can be depending on an account nobody remembers
 * creating.
 *
 * Same shape as `lib/finance/fee-setup-rules.ts`: pure predicates the screen greys an action
 * out with and the server refuses on, so the two cannot drift.
 */

export type AccountVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: AccountVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a name is free.
 *
 * `PaymentAccount` is unique on (school, name), so a clash is a constraint error on submit
 * unless it is caught as it is typed. Compared case-insensitively and trimmed, because
 * "Cash Office" and "cash office " are the same account to everyone but the database.
 */
export function canUsePaymentAccountName(
  name: string,
  taken: Array<{ id: string; name: string }>,
  selfId?: string,
): AccountVerdict {
  const trimmed = name.trim()

  if (trimmed.length < 2) {
    return { allowed: false, reason: "Give the account a name of at least two characters." }
  }

  const clash = taken.find(
    (entry) => entry.id !== selfId && entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) {
    return { allowed: false, reason: `${clash.name} already exists. Account names must be distinct.` }
  }

  return ALLOWED
}

/**
 * Whether an account may be closed.
 *
 * Closing hides it from the Record Expenditure form, so a voucher already raised against it
 * and still waiting would have nowhere to be paid from. Pay or cancel those first.
 */
export function canClosePaymentAccount(facts: { unpaidExpenseCount: number }): AccountVerdict {
  if (facts.unpaidExpenseCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `${plural(
      facts.unpaidExpenseCount,
      "voucher is",
      "vouchers are",
    )} still waiting to be paid from this account. Pay or cancel them before closing it.`,
  }
}

/**
 * Whether an account may be deleted.
 *
 * Only one nothing has ever touched. A paid voucher names the account it left from and a
 * salary payment does the same, and a staff record can be configured to be paid from one —
 * deleting under any of those either fails at the database or blanks the answer to where the
 * money came from. Closing is what is meant in every other case: it stops new spending and
 * leaves the history readable.
 */
export function canDeletePaymentAccount(facts: {
  expenseCount: number
  salaryPaymentCount: number
  staffConfigCount: number
}): AccountVerdict {
  if (facts.expenseCount > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.expenseCount,
        "voucher has",
        "vouchers have",
      )} been raised against this account. Deleting it would cut them loose from where the money left. Close it instead.`,
    }
  }

  if (facts.salaryPaymentCount > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.salaryPaymentCount,
        "salary payment was",
        "salary payments were",
      )} made from this account. Close it instead.`,
    }
  }

  if (facts.staffConfigCount > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.staffConfigCount,
        "staff member is",
        "staff members are",
      )} set to be paid from this account. Point them at another one first.`,
    }
  }

  return ALLOWED
}

/**
 * What changing the opening balance does to the running balance.
 *
 * The opening figure is a stated fact — what the account held when it was first entered here
 * — and correcting a typo in it is legitimate. But the balance is derived from it, so the
 * correction moves every figure reported for the account, and that should be said out loud
 * rather than discovered on a report. Returns null when nothing is changing.
 */
export function openingBalanceShift(
  current: string | number,
  next: string | number,
): { delta: number; direction: "up" | "down" } | null {
  const delta = Number(next) - Number(current)
  if (!Number.isFinite(delta) || delta === 0) return null

  return { delta: Math.abs(delta), direction: delta > 0 ? "up" : "down" }
}
