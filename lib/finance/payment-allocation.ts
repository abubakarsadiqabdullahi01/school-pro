/**
 * Splitting one payment across the fees it settles.
 *
 * A parent arrives with what they have, not with what a fee costs: ₦20,000 against a
 * ₦45,000 tuition, or ₦60,000 to be spread over three terms of arrears. The screen used to
 * offer whole charges only — tick it and pay all of it — so a part payment could not be
 * recorded at all, and a cashier either refused the money or took it and wrote it down
 * somewhere else.
 *
 * Kept pure, like `lib/payroll.ts`: no database and no session, because what somebody is
 * recorded as having paid has to be arithmetic anybody can check.
 */

export type AllocatableCharge = {
  id: string
  /** What is still owing on this charge, in naira. */
  balance: number
}

export type Allocation = { chargeId: string; amount: number }

/** Rounds to kobo. Money arithmetic in floating point drifts; charges are stored to 2dp. */
export function toKobo(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Spreads an amount over the charges in the order given, oldest first.
 *
 * Each charge takes what it can up to its balance and the rest moves down the list, which is
 * how a cashier does it on paper: clear the oldest debt, then the next. Anything left over
 * when every charge is settled is returned as `unallocated` rather than being forced onto
 * the last charge — overpaying a fee is not something to do silently.
 */
export function allocateAmount(
  charges: AllocatableCharge[],
  amount: number,
): { allocations: Allocation[]; unallocated: number } {
  let remaining = toKobo(Math.max(amount, 0))
  const allocations: Allocation[] = []

  for (const charge of charges) {
    if (remaining <= 0) break
    const balance = toKobo(Math.max(charge.balance, 0))
    if (balance <= 0) continue

    const applied = toKobo(Math.min(balance, remaining))
    allocations.push({ chargeId: charge.id, amount: applied })
    remaining = toKobo(remaining - applied)
  }

  return { allocations, unallocated: remaining }
}

export type AllocationProblem =
  | { kind: "nothing"; message: string }
  | { kind: "over-charge"; chargeId: string; message: string }
  | { kind: "negative"; chargeId: string; message: string }

/**
 * What is wrong with a set of allocations, in the words the cashier needs.
 *
 * The server refuses an allocation larger than its charge, which is the guarantee; this is
 * the same rule said before the click, so a full cash drawer is not held up by a round trip.
 */
export function validateAllocations(
  allocations: Allocation[],
  charges: AllocatableCharge[],
): AllocationProblem | null {
  const balances = new Map(charges.map((charge) => [charge.id, toKobo(charge.balance)]))
  const applied = allocations.filter((allocation) => allocation.amount !== 0)

  if (applied.length === 0) {
    return { kind: "nothing", message: "Enter an amount against at least one fee." }
  }

  for (const allocation of applied) {
    if (allocation.amount < 0) {
      return {
        kind: "negative",
        chargeId: allocation.chargeId,
        message: "A payment cannot be a negative amount.",
      }
    }

    const balance = balances.get(allocation.chargeId) ?? 0
    if (toKobo(allocation.amount) > balance) {
      return {
        kind: "over-charge",
        chargeId: allocation.chargeId,
        message: "That is more than this fee still owes. Reduce it, or put the rest on another fee.",
      }
    }
  }

  return null
}

/** The total being recorded. */
export function allocationTotal(allocations: Allocation[]): number {
  return toKobo(allocations.reduce((total, allocation) => total + (allocation.amount || 0), 0))
}
