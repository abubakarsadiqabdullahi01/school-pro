import { describe, expect, it } from "vitest"

import {
  decimalNairaToKobo,
  grossUpStandardNigeriaLocalFeeKobo,
  standardNigeriaLocalFeeKobo,
  validateCheckoutCharges,
} from "./checkout-rules"

const charge = {
  id: "charge-1",
  schoolId: "school-1",
  studentId: "student-1",
  termId: "term-1",
  balance: "52500.00",
  status: "UNPAID",
}

describe("online checkout money rules", () => {
  it("converts decimal naira to exact integer kobo", () => {
    expect(decimalNairaToKobo("52500.25")).toBe(5_250_025)
    expect(() => decimalNairaToKobo("10.001")).toThrow("rounded to kobo")
  })

  it("applies the standard local fee, waiver, and cap", () => {
    expect(standardNigeriaLocalFeeKobo(200_000)).toBe(3_000)
    expect(standardNigeriaLocalFeeKobo(250_000)).toBe(13_750)
    expect(standardNigeriaLocalFeeKobo(15_000_000)).toBe(200_000)
  })

  it("grosses up to leave the exact school-fee amount", () => {
    const quote = grossUpStandardNigeriaLocalFeeKobo(5_250_000)
    expect(quote.parentChargeKobo - standardNigeriaLocalFeeKobo(quote.parentChargeKobo)).toBe(5_250_000)
    expect(quote.processingFeeKobo).toBe(90_102)
  })

  it("does not overshoot the flat fee when a cheaper charge sits below the threshold", () => {
    // Paystack's flat 100 naira starts at 2,500 naira, so what the school nets drops by
    // that much the moment the charge crosses it. A search that treats the curve as one
    // rising line lands above the threshold and bills the payer about 100 naira too much.
    const quote = grossUpStandardNigeriaLocalFeeKobo(237_500)
    expect(quote.parentChargeKobo).toBe(241_117)
    expect(quote.parentChargeKobo).toBeLessThan(250_000)
    expect(quote.processingFeeKobo).toBe(3_617)
  })

  it("always discloses exactly the fee Paystack will charge", () => {
    // A disclosed fee that differs from the real one by a single kobo fails verification
    // and parks a successful payment in REQUIRES_REVIEW, so this has to hold everywhere,
    // and particularly across the threshold where the two regimes meet.
    for (let schoolFeesKobo = 200_000; schoolFeesKobo <= 300_000; schoolFeesKobo += 1) {
      const quote = grossUpStandardNigeriaLocalFeeKobo(schoolFeesKobo)
      expect(quote.processingFeeKobo).toBe(standardNigeriaLocalFeeKobo(quote.parentChargeKobo))
    }
  })

  it("finds the cheapest charge, checked exhaustively around the threshold", () => {
    const cheapest = (schoolFeesKobo: number) => {
      for (let charged = schoolFeesKobo; charged <= schoolFeesKobo + 200_000; charged += 1) {
        if (charged - standardNigeriaLocalFeeKobo(charged) >= schoolFeesKobo) return charged
      }
      throw new Error("unreachable")
    }
    for (let schoolFeesKobo = 230_000; schoolFeesKobo <= 260_000; schoolFeesKobo += 1) {
      expect(grossUpStandardNigeriaLocalFeeKobo(schoolFeesKobo).parentChargeKobo)
        .toBe(cheapest(schoolFeesKobo))
    }
  }, 15_000)

  it("uses authoritative balances and returns allocations for one term", () => {
    expect(validateCheckoutCharges([charge], {
      schoolId: "school-1",
      studentId: "student-1",
      allowPartialPayments: false,
    })).toEqual({
      termId: "term-1",
      schoolFeesKobo: 5_250_000,
      allocations: [{ chargeId: "charge-1", amountKobo: 5_250_000 }],
    })
  })

  it("rejects cross-tenant, mixed-term, and non-payable charges", () => {
    expect(() => validateCheckoutCharges([{ ...charge, schoolId: "school-2" }], {
      schoolId: "school-1", studentId: "student-1", allowPartialPayments: false,
    })).toThrow("do not belong")
    expect(() => validateCheckoutCharges([charge, { ...charge, id: "charge-2", termId: "term-2" }], {
      schoolId: "school-1", studentId: "student-1", allowPartialPayments: false,
    })).toThrow("one term")
    expect(() => validateCheckoutCharges([{ ...charge, status: "PAID", balance: 0 }], {
      schoolId: "school-1", studentId: "student-1", allowPartialPayments: false,
    })).toThrow("no longer payable")
  })

  it("enforces the school's partial-payment setting", () => {
    expect(() => validateCheckoutCharges([charge], {
      schoolId: "school-1", studentId: "student-1", allowPartialPayments: false,
    }, [{ chargeId: charge.id, amountKobo: 100_000 }])).toThrow("does not allow partial")
    expect(validateCheckoutCharges([charge], {
      schoolId: "school-1", studentId: "student-1", allowPartialPayments: true,
    }, [{ chargeId: charge.id, amountKobo: 100_000 }]).schoolFeesKobo).toBe(100_000)
  })
})
