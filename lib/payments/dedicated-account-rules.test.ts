import { describe, expect, it } from "vitest"

import {
  dedicatedAccountReadinessProblems,
  dedicatedBankFor,
  dedicatedCustomerDomain,
  dedicatedCustomerEmail,
  dedicatedTransferProblems,
  normalizeNigerianPhone,
  splitDedicatedTransfer,
  type DedicatedReadinessInput,
  type DedicatedTransferCheck,
} from "./dedicated-account-rules"

describe("dedicated account identity", () => {
  it("gives each student a stable address of its own", () => {
    const id = "3F2A9C1E-0000-4000-8000-00000000ABCD"
    expect(dedicatedCustomerEmail(id, "students.schoolpro.digisoft.com.ng"))
      .toBe("student-3f2a9c1e00004000800000000000abcd@students.schoolpro.digisoft.com.ng")
    expect(dedicatedCustomerEmail(id, "students.schoolpro.digisoft.com.ng"))
      .not.toBe(dedicatedCustomerEmail("another-student", "students.schoolpro.digisoft.com.ng"))
  })

  it("rejects an unusable domain", () => {
    expect(() => dedicatedCustomerEmail("abc", "localhost")).toThrow()
  })

  it("derives the domain from the app URL unless one is configured", () => {
    expect(dedicatedCustomerDomain({ NEXTAUTH_URL: "https://schoolpro.digisoft.com.ng" })).toBe("students.schoolpro.digisoft.com.ng")
    expect(dedicatedCustomerDomain({ NEXTAUTH_URL: "http://localhost:3000" })).toBe("students.digischool.test")
    expect(dedicatedCustomerDomain({ PAYSTACK_DVA_EMAIL_DOMAIN: "pay.example.ng", NEXTAUTH_URL: "https://a.b" })).toBe("pay.example.ng")
  })

  it("always uses Paystack's test bank in test mode", () => {
    expect(dedicatedBankFor("TEST", "wema-bank")).toBe("test-bank")
    expect(dedicatedBankFor("LIVE", "titan-paystack")).toBe("titan-paystack")
    expect(dedicatedBankFor("LIVE", "made-up-bank")).toBe("wema-bank")
  })

  it("normalizes Nigerian phone numbers and refuses others", () => {
    expect(normalizeNigerianPhone("0803 123 4567")).toBe("08031234567")
    expect(normalizeNigerianPhone("+2348031234567")).toBe("+2348031234567")
    expect(normalizeNigerianPhone("2348031234567")).toBe("+2348031234567")
    expect(normalizeNigerianPhone("12345")).toBeNull()
    expect(normalizeNigerianPhone(null)).toBeNull()
  })
})

describe("dedicated account readiness", () => {
  const ready: DedicatedReadinessInput = {
    environment: "TEST", isEnabled: true, status: "READY", verifiedAt: new Date(), dedicatedAccountsEnabled: true,
    accountMode: "PLATFORM_MANAGED", subaccountCode: "ACCT_x", hasCredential: false, liveApprovedAt: null,
  }

  it("accepts a switched-on, verified test connection", () => {
    expect(dedicatedAccountReadinessProblems(ready)).toEqual([])
  })

  it("needs the school's own DVA switch and, in live, the pilot approval", () => {
    expect(dedicatedAccountReadinessProblems({ ...ready, dedicatedAccountsEnabled: false }))
      .toEqual(["Dedicated accounts are switched off for this school"])
    expect(dedicatedAccountReadinessProblems({ ...ready, environment: "LIVE" }))
      .toEqual(["DigiSchool has not yet approved this school for live payments"])
  })

  it("needs the settlement route for the account mode", () => {
    expect(dedicatedAccountReadinessProblems({ ...ready, subaccountCode: null })).toEqual(["The school settlement subaccount is missing"])
    expect(dedicatedAccountReadinessProblems({ ...ready, accountMode: "SCHOOL_OWNED", subaccountCode: null }))
      .toEqual(["The school's Paystack credentials are missing"])
  })
})

describe("dedicated transfer verification", () => {
  const good: DedicatedTransferCheck = {
    expectedEnvironment: "test", accountMode: "PLATFORM_MANAGED", expectedSubaccountCode: "ACCT_school",
    verified: { status: "success", environment: "test", currency: "NGN", amountKobo: 5_000_000, channel: "dedicated_nuban", subaccountCode: "ACCT_school" },
  }

  it("passes a clean transfer", () => {
    expect(dedicatedTransferProblems(good)).toEqual([])
  })

  it("quarantines a transfer settling to someone else's subaccount", () => {
    expect(dedicatedTransferProblems({ ...good, verified: { ...good.verified, subaccountCode: "ACCT_other" } }))
      .toEqual(["The transfer did not settle to this school's subaccount"])
  })

  it("does not check subaccounts for a school on its own keys", () => {
    expect(dedicatedTransferProblems({ ...good, accountMode: "SCHOOL_OWNED", expectedSubaccountCode: null,
      verified: { ...good.verified, subaccountCode: undefined } })).toEqual([])
  })

  it("quarantines wrong environment, currency, channel and failed status", () => {
    expect(dedicatedTransferProblems({ ...good, verified: { ...good.verified, environment: "live", currency: "USD", channel: "card", status: "failed" } }))
      .toHaveLength(4)
  })
})

describe("splitting a transfer", () => {
  const charges = [{ id: "old", balance: 30000 }, { id: "new", balance: 20000 }]

  it("clears the oldest charge first", () => {
    expect(splitDedicatedTransfer(charges, 35000)).toEqual({
      allocations: [{ chargeId: "old", amount: 30000 }, { chargeId: "new", amount: 5000 }],
      unapplied: 0,
    })
  })

  it("holds anything beyond what is owed", () => {
    expect(splitDedicatedTransfer(charges, 60000.5)).toEqual({
      allocations: [{ chargeId: "old", amount: 30000 }, { chargeId: "new", amount: 20000 }],
      unapplied: 10000.5,
    })
  })

  it("holds the whole transfer when nothing is owed", () => {
    expect(splitDedicatedTransfer([], 1000)).toEqual({ allocations: [], unapplied: 1000 })
  })
})

describe("dedicated-account split shares", () => {
  it("carries a whole-number platform percentage into the split", async () => {
    const { dedicatedSplitShare } = await import("./dedicated-account-rules")
    expect(dedicatedSplitShare("PERCENTAGE", 2)).toEqual({ schoolShare: 98, platformPercent: 2, note: null })
    expect(dedicatedSplitShare("NONE", 0)).toEqual({ schoolShare: 100, platformPercent: 0, note: null })
  })

  it("refuses a fractional percentage and explains a flat charge", async () => {
    const { dedicatedSplitShare } = await import("./dedicated-account-rules")
    expect(() => dedicatedSplitShare("PERCENTAGE", 1.5)).toThrow(/whole-number/)
    expect(dedicatedSplitShare("FLAT", 200).note).toMatch(/cannot be taken/)
  })

  it("accepts a transfer that settled through the school's own split", async () => {
    const { dedicatedTransferProblems } = await import("./dedicated-account-rules")
    const verified = { status: "success", environment: "test" as const, currency: "NGN", amountKobo: 100, channel: "dedicated_nuban" }
    const base = { expectedEnvironment: "test" as const, accountMode: "PLATFORM_MANAGED" as const, expectedSubaccountCode: "ACCT_s", expectedSplitCode: "SPL_s" }
    expect(dedicatedTransferProblems({ ...base, verified: { ...verified, splitCode: "SPL_s" } })).toEqual([])
    expect(dedicatedTransferProblems({ ...base, verified: { ...verified, splitCode: "SPL_other" } })).toHaveLength(1)
  })
})
