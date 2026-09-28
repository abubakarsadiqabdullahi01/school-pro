import { describe, expect, it } from "vitest"

import {
  canDeactivateFeeCategory,
  canDeleteFeeCategory,
  canDeleteFeeSchedule,
  canRepointFeeSchedule,
  canUseFeeCategoryName,
  describeFeeScheduleDeletion,
  isRepriceable,
} from "./fee-setup-rules"

const untouched = { amountPaid: 0, discountAmount: 0, exemptedAmount: 0 }

describe("canRepointFeeSchedule", () => {
  it("lets a schedule that has billed nobody be re-pointed", () => {
    expect(canRepointFeeSchedule({ chargeCount: 0 })).toEqual({ allowed: true })
  })

  it("fixes scope, category and audience once a bill exists", () => {
    const verdict = canRepointFeeSchedule({ chargeCount: 60 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("60 charges")
  })

  it("counts one charge in the singular", () => {
    const verdict = canRepointFeeSchedule({ chargeCount: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 charge.")
  })
})

describe("isRepriceable", () => {
  it("re-prices a charge nobody has touched", () => {
    expect(isRepriceable(untouched)).toBe(true)
  })

  it("leaves a charge with money against it alone", () => {
    expect(isRepriceable({ ...untouched, amountPaid: 5000 })).toBe(false)
  })

  it("leaves a discounted or exempted charge alone", () => {
    expect(isRepriceable({ ...untouched, discountAmount: 2000 })).toBe(false)
    expect(isRepriceable({ ...untouched, exemptedAmount: 45000 })).toBe(false)
  })
})

describe("canDeleteFeeSchedule", () => {
  it("allows deleting one that has billed nobody", () => {
    expect(canDeleteFeeSchedule({ chargeCount: 0, settledCharges: 0, adjustedCharges: 0 })).toEqual({
      allowed: true,
    })
  })

  it("allows deleting one whose charges are all untouched", () => {
    expect(canDeleteFeeSchedule({ chargeCount: 60, settledCharges: 0, adjustedCharges: 0 })).toEqual({
      allowed: true,
    })
  })

  it("refuses once anybody has paid, because the receipts would lose what they paid for", () => {
    const verdict = canDeleteFeeSchedule({ chargeCount: 60, settledCharges: 3, adjustedCharges: 0 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("Deactivate it instead")
  })

  it("refuses where a discount or exemption was granted", () => {
    const verdict = canDeleteFeeSchedule({ chargeCount: 10, settledCharges: 0, adjustedCharges: 2 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("discount or an exemption")
  })

  it("names payment first when a schedule is both paid and adjusted", () => {
    const verdict = canDeleteFeeSchedule({ chargeCount: 10, settledCharges: 1, adjustedCharges: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("paid against this schedule")
  })
})

describe("describeFeeScheduleDeletion", () => {
  it("says plainly when nothing else goes with it", () => {
    expect(describeFeeScheduleDeletion({ chargeCount: 0 })).toContain("nothing else is affected")
  })

  it("says how many bills disappear", () => {
    expect(describeFeeScheduleDeletion({ chargeCount: 60 })).toContain("60 unpaid charges")
  })
})

describe("canDeleteFeeCategory", () => {
  it("allows deleting one nothing points at", () => {
    expect(canDeleteFeeCategory({ scheduleCount: 0, discountCount: 0, exemptionCount: 0 })).toEqual({
      allowed: true,
    })
  })

  it("refuses while a schedule reports under it", () => {
    const verdict = canDeleteFeeCategory({ scheduleCount: 3, discountCount: 0, exemptionCount: 0 })
    expect(verdict.allowed === false && verdict.reason).toContain("3 fee schedules report")
  })

  it("refuses where a discount or exemption was granted under it", () => {
    const verdict = canDeleteFeeCategory({ scheduleCount: 0, discountCount: 1, exemptionCount: 2 })
    expect(verdict.allowed === false && verdict.reason).toContain("3 discounts or exemptions were")
  })
})

describe("canDeactivateFeeCategory", () => {
  it("allows switching off a category nothing active uses", () => {
    expect(canDeactivateFeeCategory({ activeScheduleCount: 0 })).toEqual({ allowed: true })
  })

  it("refuses while active schedules report under it", () => {
    const verdict = canDeactivateFeeCategory({ activeScheduleCount: 2 })
    expect(verdict.allowed === false && verdict.reason).toContain("2 active fee schedules report")
  })
})

describe("canUseFeeCategoryName", () => {
  const existing = [
    { id: "a", name: "Tuition" },
    { id: "b", name: "Development Levy" },
  ]

  it("accepts a name nobody has taken", () => {
    expect(canUseFeeCategoryName("Transport", existing)).toEqual({ allowed: true })
  })

  it("refuses a clash whatever the case and spacing", () => {
    const verdict = canUseFeeCategoryName("  tuition ", existing)
    expect(verdict.allowed === false && verdict.reason).toContain("“Tuition”")
  })

  it("does not count the category being renamed as its own clash", () => {
    expect(canUseFeeCategoryName("Tuition", existing, "a")).toEqual({ allowed: true })
  })

  it("refuses an empty name", () => {
    expect(canUseFeeCategoryName("   ", existing).allowed).toBe(false)
  })
})
