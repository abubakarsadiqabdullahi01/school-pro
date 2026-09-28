import { Prisma } from "@prisma/client"

export type CheckoutCharge = {
  id: string
  schoolId: string
  studentId: string
  termId: string | null
  balance: Prisma.Decimal.Value
  status: string
}

export type CheckoutAllocation = { chargeId: string; amountKobo: number }

export type CheckoutTotals = {
  schoolFeesKobo: number
  processingFeeKobo: number
  parentChargeKobo: number
}

export const ACTIVE_CHECKOUT_STATUSES = [
  "CREATED",
  "INITIALIZED",
  "INITIALIZATION_UNKNOWN",
  "PENDING",
  "PROCESSING",
] as const

export function decimalNairaToKobo(value: Prisma.Decimal.Value): number {
  const amount = new Prisma.Decimal(value)
  const kobo = amount.mul(100)
  const numericKobo = kobo.toNumber()
  if (!amount.isPositive() || !kobo.isInteger() || !Number.isSafeInteger(numericKobo)) {
    throw new Error("Payment amounts must be positive and rounded to kobo")
  }
  return numericKobo
}

export function koboToDecimalNaira(value: number): Prisma.Decimal {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid kobo amount")
  return new Prisma.Decimal(value).div(100)
}

/** Where Paystack's ₦100 flat fee starts applying. */
const FLAT_FEE_THRESHOLD_KOBO = 250_000

/** The most Paystack takes from one local transaction. */
const FEE_CAP_KOBO = 200_000

/** Current standard Nigerian local pricing. It is snapshotted on each attempt. */
export function standardNigeriaLocalFeeKobo(amountKobo: number): number {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new Error("Invalid payment amount")
  const percentage = Math.ceil((amountKobo * 150) / 10_000)
  const flat = amountKobo < FLAT_FEE_THRESHOLD_KOBO ? 0 : 10_000
  return Math.min(percentage + flat, FEE_CAP_KOBO)
}

/** Smallest charge within a single pricing regime that still nets the school its fees. */
function cheapestChargeInRange(schoolFeesKobo: number, lowest: number, highest: number): number | null {
  if (lowest > highest || lowest <= 0) return null
  if (highest - standardNigeriaLocalFeeKobo(highest) < schoolFeesKobo) return null

  let low = lowest
  let high = highest
  while (low < high) {
    const candidate = Math.floor((low + high) / 2)
    if (candidate - standardNigeriaLocalFeeKobo(candidate) >= schoolFeesKobo) high = candidate
    else low = candidate + 1
  }
  return low
}

/**
 * Smallest whole-kobo charge that leaves the requested school-fee value after Paystack's fee.
 *
 * What the payer nets back to the school rises with the charge inside one pricing regime,
 * but drops by ₦100 the moment the charge reaches ₦2,500 and the flat fee starts applying.
 * A single binary search across the whole range treats that dip as though the curve were
 * monotonic, sails past a cheaper charge sitting just below the threshold and lands in the
 * dearer regime — about ₦100 out of the payer's pocket for nothing. Searching each regime
 * separately and taking the cheaper answer is the whole fix.
 */
export function grossUpStandardNigeriaLocalFeeKobo(schoolFeesKobo: number): CheckoutTotals {
  if (!Number.isSafeInteger(schoolFeesKobo) || schoolFeesKobo <= 0) throw new Error("Invalid school-fee total")

  const belowFlatFee = cheapestChargeInRange(
    schoolFeesKobo,
    schoolFeesKobo,
    FLAT_FEE_THRESHOLD_KOBO - 1,
  )
  const withFlatFee = cheapestChargeInRange(
    schoolFeesKobo,
    Math.max(schoolFeesKobo, FLAT_FEE_THRESHOLD_KOBO),
    schoolFeesKobo + FEE_CAP_KOBO,
  )
  // Anything in the first regime is by definition cheaper than anything in the second.
  const parentChargeKobo = belowFlatFee ?? withFlatFee
  if (parentChargeKobo === null) throw new Error("No payable total covers this fee after processing charges")

  return {
    schoolFeesKobo,
    processingFeeKobo: parentChargeKobo - schoolFeesKobo,
    parentChargeKobo,
  }
}

export function validateCheckoutCharges(
  charges: CheckoutCharge[],
  expected: { schoolId: string; studentId: string; allowPartialPayments: boolean },
  requestedAllocations?: CheckoutAllocation[],
): { termId: string; allocations: CheckoutAllocation[]; schoolFeesKobo: number } {
  if (charges.length === 0) throw new Error("Select at least one unpaid charge")
  if (new Set(charges.map((charge) => charge.id)).size !== charges.length) {
    throw new Error("The same charge cannot be selected twice")
  }
  if (charges.some((charge) => charge.schoolId !== expected.schoolId || charge.studentId !== expected.studentId)) {
    throw new Error("One or more charges do not belong to this student and school")
  }
  if (charges.some((charge) => !charge.termId)) {
    throw new Error("A selected fee is not assigned to a term and cannot be paid online")
  }
  const termIds = new Set(charges.map((charge) => charge.termId))
  if (termIds.size !== 1) throw new Error("Pay fees from one term at a time")

  const requested = new Map((requestedAllocations ?? []).map((allocation) => [allocation.chargeId, allocation.amountKobo]))
  if (requested.size !== (requestedAllocations ?? []).length) throw new Error("The same allocation cannot appear twice")
  if (requestedAllocations && requestedAllocations.some((allocation) => !charges.some((charge) => charge.id === allocation.chargeId))) {
    throw new Error("An allocation references an unselected charge")
  }

  const allocations = charges.map((charge) => {
    const balanceKobo = decimalNairaToKobo(charge.balance)
    if (["PAID", "WAIVED", "CANCELLED"].includes(charge.status) || balanceKobo <= 0) {
      throw new Error("A selected charge is no longer payable")
    }
    const amountKobo = requested.get(charge.id) ?? balanceKobo
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > balanceKobo) {
      throw new Error("A payment allocation must be positive and cannot exceed its current balance")
    }
    if (!expected.allowPartialPayments && amountKobo !== balanceKobo) {
      throw new Error("This school does not allow partial online payments")
    }
    return { chargeId: charge.id, amountKobo }
  })
  const schoolFeesKobo = allocations.reduce((total, allocation) => total + allocation.amountKobo, 0)
  if (!Number.isSafeInteger(schoolFeesKobo)) throw new Error("The selected payment total is too large")

  return { termId: charges[0]!.termId!, allocations, schoolFeesKobo }
}
