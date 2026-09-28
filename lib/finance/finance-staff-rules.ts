/**
 * What may be done to a finance officer's account, and why not.
 *
 * An accountant's name is on receipts, and on the approvals behind discounts and exemptions.
 * Those records are the school's evidence of who handled its money, so an account that has
 * touched anything is revoked rather than removed — the same shape as the other rule modules
 * here: pure predicates the screen greys an action out with and the server refuses on.
 */

export type StaffVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: StaffVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether the account may be deleted outright.
 *
 * Deleting a user takes their credentials and their admin record with it, and leaves every
 * receipt they issued saying nobody received the money — `Payment.receivedBy` is SET NULL.
 * An account that has never been used is a mistyped invitation and may simply go.
 */
export function canDeleteFinanceOfficer(facts: {
  paymentsRecorded: number
  adjustmentsApproved: number
  /**
   * Expenditure vouchers they recorded, approved or paid, and payroll runs or salary
   * payments they generated, approved or paid. An accountant holds `expenditure.manage` and
   * `payroll.pay`, so this is ordinary work for them, and every one of those rows names them:
   * some refuse the delete outright at the database, the rest silently lose who released
   * the money.
   */
  spendingHandled?: number
}): StaffVerdict {
  if (facts.paymentsRecorded > 0) {
    return {
      allowed: false,
      reason: `This officer has issued ${plural(
        facts.paymentsRecorded,
        "receipt",
        "receipts",
      )}. Deleting the account would leave those receipts with nobody named as having taken the money. Revoke access instead.`,
    }
  }

  if (facts.adjustmentsApproved > 0) {
    return {
      allowed: false,
      reason: `This officer approved ${plural(
        facts.adjustmentsApproved,
        "discount or exemption",
        "discounts or exemptions",
      )}. Those approvals name them. Revoke access instead.`,
    }
  }

  if ((facts.spendingHandled ?? 0) > 0) {
    return {
      allowed: false,
      reason: `This officer handled ${plural(
        facts.spendingHandled ?? 0,
        "expenditure or payroll record",
        "expenditure or payroll records",
      )}. Those records name who recorded and released the money. Revoke access instead.`,
    }
  }

  return ALLOWED
}

/** What deleting will actually remove, for the confirmation. */
export function describeFinanceOfficerDeletion(name: string): string {
  return `${name} has never recorded a payment or approved an adjustment, so nothing else refers to this account.`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Whether an email may be used for this officer.
 *
 * `Credential.value` is unique across the whole platform, not per school, so a clash is with
 * somebody the admin may not be able to see. Saying "already in use" without naming them is
 * deliberate: who holds an address at another school is not this admin's business.
 */
export function canUseOfficerEmail(
  email: string,
  taken: Array<{ userId: string; email: string }>,
  excludeUserId?: string,
): StaffVerdict {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return { allowed: false, reason: "An email address is needed to sign in." }
  if (!EMAIL.test(wanted)) return { allowed: false, reason: "That is not an email address." }

  const clash = taken.find(
    (entry) => entry.userId !== excludeUserId && entry.email.trim().toLowerCase() === wanted,
  )

  return clash ? { allowed: false, reason: "That email is already in use." } : ALLOWED
}
