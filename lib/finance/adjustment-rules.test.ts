import { describe, expect, it } from "vitest"

import { checkAdjustment, remainingOn, requestedAmount, toKobo } from "./adjustment-rules"

const untouched = { originalAmount: 45000, finalAmountDue: 45000, amountPaid: 0 }
const partPaid = { originalAmount: 45000, finalAmountDue: 45000, amountPaid: 20000 }
const alreadyReduced = { originalAmount: 45000, finalAmountDue: 37500, amountPaid: 0 }

describe("requestedAmount", () => {
  it("takes a fixed amount as written", () => {
    expect(requestedAmount("FIXED", 7500, untouched)).toBe(7500)
  })

  it("takes a percentage of what the fee was, not of what is left", () => {
    // Half off a ₦45,000 tuition is ₦22,500 whether or not ₦20,000 has been paid.
    expect(requestedAmount("PERCENTAGE", 50, untouched)).toBe(22500)
    expect(requestedAmount("PERCENTAGE", 50, partPaid)).toBe(22500)
  })

  it("rounds to kobo", () => {
    expect(requestedAmount("PERCENTAGE", 33.333, untouched)).toBe(14999.85)
  })

  it("treats a blank or unusable entry as nothing", () => {
    expect(requestedAmount("FIXED", Number.NaN, untouched)).toBe(0)
  })
})

describe("remainingOn", () => {
  it("is what the family still owes on the charge", () => {
    expect(remainingOn(partPaid)).toBe(25000)
  })

  it("accounts for an adjustment already granted", () => {
    expect(remainingOn(alreadyReduced)).toBe(37500)
  })

  it("never goes below zero on a settled charge", () => {
    expect(remainingOn({ originalAmount: 45000, finalAmountDue: 45000, amountPaid: 45000 })).toBe(0)
  })
})

describe("checkAdjustment", () => {
  const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`

  it("allows a discount within what is owing and says what it leaves", () => {
    expect(checkAdjustment("FIXED", 7500, untouched)).toEqual({
      allowed: true,
      amount: 7500,
      newBalance: 37500,
    })
  })

  it("allows a percentage and converts it to naira", () => {
    expect(checkAdjustment("PERCENTAGE", 10, untouched)).toMatchObject({ allowed: true, amount: 4500 })
  })

  it("refuses more than is still owing, naming the ceiling", () => {
    const verdict = checkAdjustment("FIXED", 30000, partPaid, naira)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("₦25,000 still owing")
  })

  it("refuses a percentage that comes to more than is owing", () => {
    // 100% of 45,000 against a charge with 25,000 left is money the school has banked.
    expect(checkAdjustment("PERCENTAGE", 100, partPaid).allowed).toBe(false)
  })

  it("refuses nothing, and says which kind of nothing", () => {
    expect(checkAdjustment("FIXED", 0, untouched)).toMatchObject({
      allowed: false,
      reason: "Enter an amount greater than zero.",
    })
    expect(checkAdjustment("PERCENTAGE", 0, untouched)).toMatchObject({
      reason: "Enter a percentage greater than zero.",
    })
  })

  it("refuses a negative adjustment, which would raise the bill", () => {
    expect(checkAdjustment("FIXED", -5000, untouched).allowed).toBe(false)
  })

  it("allows clearing the rest of a part-paid charge exactly", () => {
    expect(checkAdjustment("FIXED", 25000, partPaid)).toEqual({
      allowed: true,
      amount: 25000,
      newBalance: 0,
    })
  })
})

describe("toKobo", () => {
  it("keeps kobo exact where floating point drifts", () => {
    expect(toKobo(0.1 + 0.2)).toBe(0.3)
  })
})
