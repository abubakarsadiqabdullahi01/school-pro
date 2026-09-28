/**
 * What a discount or an exemption actually takes off a charge.
 *
 * Two shapes, and they do not mean the same thing. A fixed amount is the naira written on
 * the approval; a percentage is a share of what the fee *was*, not of what is left — half
 * off a ₦45,000 tuition is ₦22,500 whether or not ₦20,000 has already been paid. What
 * neither may do is take off more than the family still owes on that charge, because the
 * school cannot give back money it has already banked by adjusting a bill.
 *
 * The same arithmetic runs on the server before anything is written. It is repeated here as
 * a pure function so the screen can show the figure, and refuse, before a cashier clicks —
 * and so the two cannot drift.
 */

export type AdjustmentType = "FIXED" | "PERCENTAGE"

export type AdjustableCharge = {
  /** The fee before any adjustment — what a percentage is taken of. */
  originalAmount: number
  /** What is currently due after earlier adjustments. */
  finalAmountDue: number
  amountPaid: number
}

/** Rounds to kobo. Charges are stored to two decimal places; so is what comes off them. */
export function toKobo(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** What the family still owes on this charge — the ceiling for any adjustment. */
export function remainingOn(charge: AdjustableCharge): number {
  return toKobo(Math.max(charge.finalAmountDue - charge.amountPaid, 0))
}

/** The naira a request comes to, before it is checked against the charge. */
export function requestedAmount(type: AdjustmentType, value: number, charge: AdjustableCharge): number {
  if (!Number.isFinite(value)) return 0
  return toKobo(type === "PERCENTAGE" ? (charge.originalAmount * value) / 100 : value)
}

export type AdjustmentVerdict =
  | { allowed: true; amount: number; newBalance: number }
  | { allowed: false; reason: string; amount: number }

/**
 * Whether this adjustment may be recorded, and what it would leave owing.
 *
 * The messages are the ones the person at the screen needs, which is why they name the
 * ceiling: "more than the ₦25,000 still owing" tells them what to type instead, where
 * "invalid amount" would send them guessing.
 */
export function checkAdjustment(
  type: AdjustmentType,
  value: number,
  charge: AdjustableCharge,
  format: (amount: number) => string = (amount) => amount.toFixed(2),
): AdjustmentVerdict {
  const amount = requestedAmount(type, value, charge)
  const remaining = remainingOn(charge)

  if (amount <= 0) {
    return {
      allowed: false,
      amount,
      reason:
        type === "PERCENTAGE"
          ? "Enter a percentage greater than zero."
          : "Enter an amount greater than zero.",
    }
  }

  if (amount > remaining) {
    return {
      allowed: false,
      amount,
      reason: `That is ${format(amount)}, more than the ${format(remaining)} still owing on this fee.`,
    }
  }

  return { allowed: true, amount, newBalance: toKobo(remaining - amount) }
}
