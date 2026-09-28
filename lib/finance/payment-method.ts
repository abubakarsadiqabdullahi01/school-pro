/**
 * How a payment was made.
 *
 * `Payment.paymentMethod` is a plain string column rather than the `PaymentMethod` enum, and
 * two spellings of the same thing have ended up in it: the app records `BANK_TRANSFER`, while
 * the demo seed wrote `Bank Transfer`. Both mean a bank transfer, so both are matched when
 * filtering and both are shown the same way. New rows are written in the canonical form.
 */

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "POS", label: "POS" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
] as const

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"]

/**
 * `BANK_TRANSFER` → `Bank transfer`.
 *
 * An unknown value is titled rather than dropped: a method this list has not caught up with
 * should still read as words on a receipt, not as `SOME_NEW_WALLET`.
 */
export function paymentMethodLabel(value: string): string {
  const known = PAYMENT_METHODS.find(
    (method) => method.value === value || method.label.toLowerCase() === value.toLowerCase(),
  )
  if (known) return known.label

  const words = value.replace(/_/g, " ").trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value
}

/** Every spelling of a method that may be sitting in the column, for an `in` filter. */
export function paymentMethodVariants(value: string): string[] {
  const known = PAYMENT_METHODS.find((method) => method.value === value)
  if (!known) return [value]

  // Both cases of the readable form: `Bank Transfer` from the seed, `Bank transfer` from
  // anything written against this list. MySQL's collation ignores the difference, but the
  // filter should not depend on the database being configured that way.
  return [...new Set([known.value, known.label, known.label.replace(/\b\w/g, (c) => c.toUpperCase())])]
}
