import { describe, expect, it } from "vitest"

import { platformChargeKobo, platformChargeProblems } from "./platform-charge"

describe("platformChargeProblems", () => {
  it("accepts a charge that is switched off", () => {
    expect(platformChargeProblems({ type: "NONE", value: 0 })).toEqual([])
  })

  it("refuses a value on a charge that is switched off", () => {
    expect(platformChargeProblems({ type: "NONE", value: 500 })).toHaveLength(1)
  })

  it("refuses a charge of zero", () => {
    expect(platformChargeProblems({ type: "FLAT", value: 0 })).toHaveLength(1)
    expect(platformChargeProblems({ type: "PERCENTAGE", value: 0 })).toHaveLength(1)
  })

  it("accepts ordinary values", () => {
    expect(platformChargeProblems({ type: "FLAT", value: 200 })).toEqual([])
    expect(platformChargeProblems({ type: "PERCENTAGE", value: 1.5 })).toEqual([])
  })

  it("refuses values a school would dispute", () => {
    expect(platformChargeProblems({ type: "FLAT", value: 20_001 })).toHaveLength(1)
    expect(platformChargeProblems({ type: "PERCENTAGE", value: 10.01 })).toHaveLength(1)
  })

  it("refuses precision finer than the currency", () => {
    expect(platformChargeProblems({ type: "FLAT", value: 1.234 })).toHaveLength(1)
  })
})

describe("platformChargeKobo", () => {
  it("takes nothing when switched off", () => {
    expect(platformChargeKobo({
      type: "NONE", value: 0, schoolFeesKobo: 5_000_000, providerFeeKobo: 75_100,
    })).toBe(0)
  })

  it("converts a flat charge to kobo", () => {
    expect(platformChargeKobo({
      type: "FLAT", value: 200, schoolFeesKobo: 5_000_000, providerFeeKobo: 75_100,
    })).toBe(20_000)
  })

  it("takes a percentage of the school fees, rounded up to the kobo", () => {
    // 1% of ₦52,500 is ₦525.
    expect(platformChargeKobo({
      type: "PERCENTAGE", value: 1, schoolFeesKobo: 5_250_000, providerFeeKobo: 88_750,
    })).toBe(52_500)
  })

  it("rounds a fractional percentage up rather than losing the remainder", () => {
    // 0.5% of ₦1,000.01 is 50.0005 kobo.
    expect(platformChargeKobo({
      type: "PERCENTAGE", value: 0.5, schoolFeesKobo: 100_001, providerFeeKobo: 1_500,
    })).toBe(501)
  })

  it("never leaves the school with nothing", () => {
    // A flat ₦20,000 against a ₦1,000 fee would settle the school negative.
    const charge = platformChargeKobo({
      type: "FLAT", value: 20_000, schoolFeesKobo: 100_000, providerFeeKobo: 1_500,
    })
    expect(charge).toBe(100_000 - 1_500 - 1)
    expect(charge).toBeLessThan(100_000 - 1_500)
  })

  it("takes nothing when the provider fee already consumes the payment", () => {
    expect(platformChargeKobo({
      type: "PERCENTAGE", value: 5, schoolFeesKobo: 1_000, providerFeeKobo: 1_000,
    })).toBe(0)
  })

  it("refuses to compute from a value that could not be saved", () => {
    expect(() => platformChargeKobo({
      type: "PERCENTAGE", value: 50, schoolFeesKobo: 5_000_000, providerFeeKobo: 75_100,
    })).toThrow(/not a usable value/)
  })

  it("refuses a nonsensical payment total", () => {
    expect(() => platformChargeKobo({
      type: "FLAT", value: 200, schoolFeesKobo: 0, providerFeeKobo: 0,
    })).toThrow(/Invalid school-fee total/)
  })
})
