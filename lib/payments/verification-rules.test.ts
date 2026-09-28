import { describe, expect, it } from "vitest"

import {
  gatewayVerificationIdentityProblems,
  gatewayVerificationProblems,
  type LocalGatewayVerification,
} from "./verification-rules"

const local: LocalGatewayVerification = {
  reference: "DSP-1",
  environment: "TEST",
  requestedAmountKobo: 5_340_102,
  expectedSchoolFeesKobo: 5_250_000,
  allocationTotalKobo: 5_250_000,
  accountMode: "PLATFORM_MANAGED",
  expectedSubaccountCode: "ACCT_school",
  feePolicy: "PARENT_PAYS_GROSS_UP",
  disclosedProcessingFeeKobo: 90_102,
}

const verified = {
  reference: "DSP-1",
  environment: "test" as const,
  status: "success",
  currency: "NGN",
  amountKobo: 5_340_102,
  requestedAmountKobo: 5_340_102,
  feesKobo: 90_102,
  subaccountCode: "ACCT_school",
}

describe("gateway confirmation invariants", () => {
  it("accepts an exact verified payment", () => {
    expect(gatewayVerificationProblems(local, verified)).toEqual([])
  })

  it("quarantines amount, allocation, environment, and settlement mismatches", () => {
    expect(gatewayVerificationProblems(
      { ...local, allocationTotalKobo: 5_000_000 },
      { ...verified, environment: "live", requestedAmountKobo: 1, amountKobo: 2, subaccountCode: "ACCT_other" },
    )).toEqual(expect.arrayContaining([
      "Provider environment does not match",
      "Requested amount does not match",
      "Charged amount differs from the disclosed checkout total",
      "Allocation total does not match school fees",
      "Settlement subaccount does not match",
    ]))
  })

  it("quarantines an incorrect provider reference and currency", () => {
    expect(gatewayVerificationProblems(
      local,
      { ...verified, reference: "DSP-WRONG", currency: "USD" },
    )).toEqual(expect.arrayContaining([
      "Provider reference does not match",
      "Provider currency does not match",
    ]))
  })

  it("does not require a subaccount for a school-owned Paystack account", () => {
    expect(gatewayVerificationProblems(
      { ...local, accountMode: "SCHOOL_OWNED", expectedSubaccountCode: null },
      { ...verified, subaccountCode: undefined },
    )).toEqual([])
  })

  it("checks identity without treating a legitimate failed status as an amount mismatch", () => {
    expect(gatewayVerificationIdentityProblems(local, {
      reference: verified.reference,
      environment: verified.environment,
      currency: verified.currency,
    })).toEqual([])
  })
})
