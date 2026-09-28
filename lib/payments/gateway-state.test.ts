import { describe, expect, it } from "vitest"

import {
  assertGatewayEventTransition,
  assertGatewayTransactionTransition,
  canTransitionGatewayEvent,
  canTransitionGatewayTransaction,
} from "./gateway-state"

describe("gateway transaction state", () => {
  it("allows the normal checkout path", () => {
    expect(canTransitionGatewayTransaction("CREATED", "INITIALIZED")).toBe(true)
    expect(canTransitionGatewayTransaction("INITIALIZED", "PROCESSING")).toBe(true)
    expect(canTransitionGatewayTransaction("PROCESSING", "SUCCEEDED")).toBe(true)
  })

  it("can recover an unknown initialization without creating a new reference", () => {
    expect(canTransitionGatewayTransaction("INITIALIZATION_UNKNOWN", "INITIALIZED")).toBe(true)
    expect(canTransitionGatewayTransaction("INITIALIZATION_UNKNOWN", "SUCCEEDED")).toBe(true)
  })

  it("accepts a late success after the browser abandoned checkout", () => {
    expect(canTransitionGatewayTransaction("ABANDONED", "SUCCEEDED")).toBe(true)
  })

  it("does not let a terminal failure become a success", () => {
    expect(() => assertGatewayTransactionTransition("FAILED", "SUCCEEDED")).toThrow(
      "Gateway transaction cannot move from FAILED to SUCCEEDED",
    )
  })

  it("allows a terminal failure to be quarantined when the provider later contradicts it", () => {
    expect(canTransitionGatewayTransaction("FAILED", "REQUIRES_REVIEW")).toBe(true)
  })

  it("allows idempotent re-observation of the same state", () => {
    expect(canTransitionGatewayTransaction("SUCCEEDED", "SUCCEEDED")).toBe(true)
  })
})

describe("gateway event state", () => {
  it("allows processing and completion", () => {
    expect(canTransitionGatewayEvent("PENDING", "PROCESSING")).toBe(true)
    expect(canTransitionGatewayEvent("PROCESSING", "PROCESSED")).toBe(true)
  })

  it("allows a failed event to be retried", () => {
    expect(canTransitionGatewayEvent("FAILED", "PENDING")).toBe(true)
  })

  it("keeps a processed event terminal", () => {
    expect(() => assertGatewayEventTransition("PROCESSED", "PROCESSING")).toThrow(
      "Gateway event cannot move from PROCESSED to PROCESSING",
    )
  })
})
