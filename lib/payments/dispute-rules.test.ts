import { describe, expect, it } from "vitest"

import { disputeOutcome, isDisputeResolution } from "./dispute-rules"

describe("disputeOutcome", () => {
  it("leaves the payment standing when the claim was declined", () => {
    expect(disputeOutcome({ status: "resolved", resolution: "declined" })).toBe("SCHOOL_KEEPS")
  })

  it("reopens the fees when the school accepted the claim and the payer was refunded", () => {
    expect(disputeOutcome({ status: "resolved", resolution: "merchant-accepted" })).toBe("PAYER_REFUNDED")
  })

  it("ignores casing and padding, which providers are not consistent about", () => {
    expect(disputeOutcome({ status: "resolved", resolution: "  Merchant-Accepted " })).toBe("PAYER_REFUNDED")
    expect(disputeOutcome({ status: "RESOLVED", resolution: "DECLINED" })).toBe("SCHOOL_KEEPS")
  })

  it("asks a human when resolved without saying how", () => {
    expect(disputeOutcome({ status: "resolved", resolution: null })).toBe("UNCLEAR")
    expect(disputeOutcome({ status: "resolved", resolution: "" })).toBe("UNCLEAR")
    expect(disputeOutcome({ status: "resolved", resolution: undefined })).toBe("UNCLEAR")
  })

  it("asks a human about a resolution it has never seen", () => {
    // A new provider value must never be guessed at: one reading reverses fees the school
    // is owed, the other leaves it short without knowing.
    expect(disputeOutcome({ status: "resolved", resolution: "partially-accepted" })).toBe("UNCLEAR")
  })
})

describe("isDisputeResolution", () => {
  it("recognises only the closing event", () => {
    expect(isDisputeResolution("charge.dispute.resolve")).toBe(true)
    expect(isDisputeResolution("charge.dispute.create")).toBe(false)
    expect(isDisputeResolution("charge.dispute.remind")).toBe(false)
  })
})
