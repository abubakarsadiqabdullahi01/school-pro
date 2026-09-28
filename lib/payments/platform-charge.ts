import { Prisma } from "@prisma/client"

/**
 * What DigiSchool keeps from a payment it processes on a school's behalf.
 *
 * This only applies to `PLATFORM_MANAGED` schools — the ones with no Paystack account of
 * their own, collecting through DigiSchool's. A school on its own keys settles directly and
 * there is nothing for the platform to take.
 *
 * It is taken out of the school's settlement, not added to what the parent pays. Paystack's
 * `transaction_charge` keeps this amount in the main account and settles the rest to the
 * school's subaccount, so the total the parent is debited, the amount the receipt credits
 * and every figure the verification checks are all unchanged. The school's own statement is
 * where the deduction shows, which is the only place a management fee honestly belongs.
 */

export type PlatformChargeType = "NONE" | "FLAT" | "PERCENTAGE"

/** A flat charge above this reads as a mistake rather than a fee. Naira. */
export const MAX_FLAT_CHARGE_NAIRA = 20_000

/** Percent. Above this the platform is taking more than the gateway does. */
export const MAX_PERCENTAGE_CHARGE = 10

/**
 * Why a configured platform charge cannot be saved, or an empty list.
 *
 * Kept separate from the calculation so the super admin is told at the point of saving,
 * rather than a parent's checkout failing later on a value nobody could have paid.
 */
export function platformChargeProblems(input: {
  type: PlatformChargeType
  value: Prisma.Decimal.Value
}): string[] {
  const problems: string[] = []
  const value = new Prisma.Decimal(input.value)

  if (input.type === "NONE") {
    if (!value.isZero()) problems.push("A platform charge of NONE must have a value of zero")
    return problems
  }

  if (!value.isPositive() || value.isZero()) {
    problems.push("A platform charge must be greater than zero")
    return problems
  }

  if (input.type === "FLAT") {
    if (value.decimalPlaces() > 2) problems.push("A flat platform charge cannot be finer than one kobo")
    if (value.greaterThan(MAX_FLAT_CHARGE_NAIRA)) {
      problems.push(`A flat platform charge cannot exceed ₦${MAX_FLAT_CHARGE_NAIRA.toLocaleString()}`)
    }
  }

  if (input.type === "PERCENTAGE") {
    if (value.decimalPlaces() > 2) problems.push("A percentage platform charge cannot be finer than 0.01%")
    if (value.greaterThan(MAX_PERCENTAGE_CHARGE)) {
      problems.push(`A percentage platform charge cannot exceed ${MAX_PERCENTAGE_CHARGE}%`)
    }
  }

  return problems
}

/**
 * The charge in kobo for one payment, clamped so the school always nets something.
 *
 * `providerFeeKobo` is what Paystack itself will take from the same settlement. Without
 * subtracting it, a charge sized against the fee total could leave the school with nothing
 * or send Paystack a `transaction_charge` larger than the transaction, which it rejects —
 * turning a pricing mistake into a failed payment for a parent.
 */
export function platformChargeKobo(input: {
  type: PlatformChargeType
  /** Naira for FLAT, percent for PERCENTAGE. */
  value: Prisma.Decimal.Value
  schoolFeesKobo: number
  providerFeeKobo: number
}): number {
  if (input.type === "NONE") return 0
  if (!Number.isSafeInteger(input.schoolFeesKobo) || input.schoolFeesKobo <= 0) {
    throw new Error("Invalid school-fee total")
  }
  if (!Number.isSafeInteger(input.providerFeeKobo) || input.providerFeeKobo < 0) {
    throw new Error("Invalid provider fee")
  }
  if (platformChargeProblems({ type: input.type, value: input.value }).length > 0) {
    throw new Error("The platform charge for this school is not a usable value")
  }

  const value = new Prisma.Decimal(input.value)
  const raw = input.type === "FLAT"
    ? value.mul(100).toNumber()
    : Math.ceil(input.schoolFeesKobo * value.toNumber() / 100)

  // One kobo, so the school's settlement is never exactly zero.
  const headroom = input.schoolFeesKobo - input.providerFeeKobo - 1
  if (headroom <= 0) return 0
  return Math.max(0, Math.min(Math.round(raw), headroom))
}
