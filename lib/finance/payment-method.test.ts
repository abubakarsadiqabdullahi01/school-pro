import { describe, expect, it } from "vitest"

import { PAYMENT_METHODS, paymentMethodLabel, paymentMethodVariants } from "./payment-method"

describe("paymentMethodLabel", () => {
  it("reads the stored value as words", () => {
    expect(paymentMethodLabel("BANK_TRANSFER")).toBe("Bank transfer")
    expect(paymentMethodLabel("CASH")).toBe("Cash")
  })

  it("leaves POS in capitals, because that is its name", () => {
    expect(paymentMethodLabel("POS")).toBe("POS")
  })

  it("recognises the spelling the demo seed wrote", () => {
    expect(paymentMethodLabel("Bank Transfer")).toBe("Bank transfer")
  })

  it("still reads as words when the method is one we have not listed", () => {
    expect(paymentMethodLabel("MOBILE_WALLET")).toBe("Mobile wallet")
  })
})

describe("paymentMethodVariants", () => {
  it("covers both spellings, so a filter finds seeded and recorded payments alike", () => {
    expect(paymentMethodVariants("BANK_TRANSFER")).toEqual(["BANK_TRANSFER", "Bank transfer", "Bank Transfer"])
  })

  it("does not repeat a method whose spellings coincide", () => {
    expect(paymentMethodVariants("POS")).toEqual(["POS"])
  })

  it("passes an unknown value through rather than matching nothing", () => {
    expect(paymentMethodVariants("MOBILE_WALLET")).toEqual(["MOBILE_WALLET"])
  })

  it("offers a variant list for every method the app records", () => {
    for (const method of PAYMENT_METHODS) {
      expect(paymentMethodVariants(method.value)).toContain(method.value)
    }
  })
})
