import { describe, expect, it } from "vitest"

import {
  allocateAmount,
  allocationTotal,
  toKobo,
  validateAllocations,
  type AllocatableCharge,
} from "./payment-allocation"

const charges: AllocatableCharge[] = [
  { id: "tuition-first", balance: 45000 },
  { id: "levy-first", balance: 7500 },
  { id: "tuition-second", balance: 45000 },
]

describe("allocateAmount", () => {
  it("puts a part payment against the oldest fee", () => {
    expect(allocateAmount(charges, 20000)).toEqual({
      allocations: [{ chargeId: "tuition-first", amount: 20000 }],
      unallocated: 0,
    })
  })

  it("spills what is left down the list once a fee is settled", () => {
    expect(allocateAmount(charges, 50000).allocations).toEqual([
      { chargeId: "tuition-first", amount: 45000 },
      { chargeId: "levy-first", amount: 5000 },
    ])
  })

  it("hands back what it cannot place rather than overpaying the last fee", () => {
    const result = allocateAmount(charges, 100000)
    expect(allocationTotal(result.allocations)).toBe(97500)
    expect(result.unallocated).toBe(2500)
  })

  it("skips a fee that is already settled", () => {
    const settled = [{ id: "paid", balance: 0 }, ...charges]
    expect(allocateAmount(settled, 1000).allocations).toEqual([{ chargeId: "tuition-first", amount: 1000 }])
  })

  it("allocates nothing for nothing", () => {
    expect(allocateAmount(charges, 0)).toEqual({ allocations: [], unallocated: 0 })
    expect(allocateAmount(charges, -500)).toEqual({ allocations: [], unallocated: 0 })
  })

  it("keeps kobo exact where floating point would drift", () => {
    const odd: AllocatableCharge[] = [{ id: "a", balance: 0.1 }, { id: "b", balance: 0.2 }]
    const result = allocateAmount(odd, 0.3)
    expect(allocationTotal(result.allocations)).toBe(0.3)
    expect(result.unallocated).toBe(0)
  })
})

describe("validateAllocations", () => {
  it("passes a part payment within the balance", () => {
    expect(validateAllocations([{ chargeId: "tuition-first", amount: 20000 }], charges)).toBeNull()
  })

  it("refuses more than the fee owes", () => {
    const problem = validateAllocations([{ chargeId: "levy-first", amount: 8000 }], charges)
    expect(problem?.kind).toBe("over-charge")
    expect(problem?.message).toContain("more than this fee still owes")
  })

  it("refuses a negative amount", () => {
    expect(validateAllocations([{ chargeId: "levy-first", amount: -100 }], charges)?.kind).toBe("negative")
  })

  it("refuses an empty payment, and treats zeroes as empty", () => {
    expect(validateAllocations([], charges)?.kind).toBe("nothing")
    expect(validateAllocations([{ chargeId: "levy-first", amount: 0 }], charges)?.kind).toBe("nothing")
  })

  it("refuses an allocation against a charge that is not on the list", () => {
    expect(validateAllocations([{ chargeId: "ghost", amount: 100 }], charges)?.kind).toBe("over-charge")
  })
})

describe("toKobo", () => {
  it("rounds to the kobo a charge is stored in", () => {
    expect(toKobo(1000.005)).toBe(1000.01)
    expect(toKobo(0.1 + 0.2)).toBe(0.3)
  })
})
