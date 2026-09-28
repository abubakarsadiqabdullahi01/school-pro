/**
 * What a resolved chargeback means for the school's books.
 *
 * A dispute is the one event that can take money back out of a school's account after the
 * fees were marked paid. Until it resolves nothing should move — but once it does, leaving
 * the transaction sitting at DISPUTED is the worst outcome available: if the payer won, the
 * ledger goes on claiming those fees are settled while the money has already been clawed
 * back, and the debt silently disappears from the debtors report.
 *
 * Paystack expresses the outcome as a `resolution` on the dispute. Only two values are
 * acted on, and anything else — a new value, a missing one, a status that says resolved
 * without saying how — goes to a person rather than being guessed at. Guessing here either
 * reverses fees a school is entitled to, or leaves it short and unaware.
 */

export type DisputeOutcome =
  /** The dispute was declined. The school keeps the money and the payment stands. */
  | "SCHOOL_KEEPS"
  /** The payer was refunded. The money has left; the fees they settled must reopen. */
  | "PAYER_REFUNDED"
  /** Resolved in some way this code does not recognise. A human decides. */
  | "UNCLEAR"

/**
 * `merchant-accepted` means the school accepted the claim, so the payer is refunded.
 * `declined` means the claim was rejected, so the school keeps the money.
 */
const MERCHANT_ACCEPTED = "merchant-accepted"
const DECLINED = "declined"

export function disputeOutcome(input: {
  status: string | null | undefined
  resolution: string | null | undefined
}): DisputeOutcome {
  const resolution = input.resolution?.trim().toLowerCase() ?? ""
  if (resolution === MERCHANT_ACCEPTED) return "PAYER_REFUNDED"
  if (resolution === DECLINED) return "SCHOOL_KEEPS"
  return "UNCLEAR"
}

/** Whether an event type is the one that closes a dispute rather than opening or nudging it. */
export function isDisputeResolution(eventType: string): boolean {
  return eventType.endsWith(".resolve")
}
