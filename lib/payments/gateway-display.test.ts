import { describe, expect, it } from "vitest"
import { GATEWAY_STATUS_LABELS, gatewayEventTone, gatewayStatusTone } from "./gateway-display"

describe("gateway operations display", () => {
  it("uses human labels for operational exception states", () => {
    expect(GATEWAY_STATUS_LABELS.REQUIRES_REVIEW).toBe("Requires review")
    expect(GATEWAY_STATUS_LABELS.INITIALIZATION_UNKNOWN).toBe("Initialization uncertain")
  })

  it("makes success, waiting and failures visually distinct", () => {
    expect(gatewayStatusTone("SUCCEEDED")).toContain("green")
    expect(gatewayStatusTone("PENDING")).toContain("amber")
    expect(gatewayStatusTone("FAILED")).toContain("red")
    expect(gatewayEventTone("FAILED")).toContain("red")
  })
})
