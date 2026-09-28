import { describe, expect, it } from "vitest"

import { gatewayActivationProblems, type GatewayActivationInput } from "./payment-settings-rules"

const readyPlatform: GatewayActivationInput = {
  environment: "TEST",
  accountMode: "PLATFORM_MANAGED",
  status: "READY",
  verifiedAt: new Date("2026-09-25T00:00:00.000Z"),
  subaccountCode: "ACCT_test",
  hasCredential: false,
  allowedChannels: ["card", "bank_transfer"],
  testConfigurationReady: true,
  liveApproved: false,
}

describe("payment gateway activation rules", () => {
  it("accepts a verified platform-managed test configuration", () => {
    expect(gatewayActivationProblems(readyPlatform)).toEqual([])
  })

  it("blocks an unverified or incomplete platform-managed connection", () => {
    expect(gatewayActivationProblems({
      ...readyPlatform,
      status: "DRAFT",
      verifiedAt: null,
      subaccountCode: null,
      allowedChannels: [],
    })).toEqual([
      "Verify the Paystack connection before enabling online payments",
      "The school settlement subaccount is missing",
      "Choose at least one supported payment channel",
    ])
  })

  it("requires encrypted credentials for a school-owned connection", () => {
    expect(gatewayActivationProblems({
      ...readyPlatform,
      accountMode: "SCHOOL_OWNED",
      subaccountCode: null,
      hasCredential: false,
    })).toEqual(["The school's Paystack credentials are missing"])
  })

  it("allows school-owned mode without a platform subaccount", () => {
    expect(gatewayActivationProblems({
      ...readyPlatform,
      accountMode: "SCHOOL_OWNED",
      subaccountCode: null,
      hasCredential: true,
    })).toEqual([])
  })

  it("blocks live activation until a test configuration is verified", () => {
    expect(gatewayActivationProblems({
      ...readyPlatform,
      environment: "LIVE",
      testConfigurationReady: false,
      liveApproved: true,
    })).toEqual(["Verify the test connection before enabling live payments"])
  })

  it("blocks live activation until DigiSchool approves the school for the pilot", () => {
    expect(gatewayActivationProblems({ ...readyPlatform, environment: "LIVE" })).toEqual([
      "DigiSchool has not yet approved this school for live payments",
    ])
    expect(gatewayActivationProblems({ ...readyPlatform, environment: "LIVE", liveApproved: true })).toEqual([])
  })

  it("rejects unknown channel values even if the JSON array is non-empty", () => {
    expect(gatewayActivationProblems({ ...readyPlatform, allowedChannels: ["unsupported"] })).toEqual([
      "Choose at least one supported payment channel",
    ])
  })
})
