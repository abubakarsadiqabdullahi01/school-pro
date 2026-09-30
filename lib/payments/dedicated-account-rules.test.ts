import { describe, expect, it } from "vitest"

import {
  dedicatedAccountReadinessProblems,
  dedicatedBankFor,
  dedicatedCustomerDomain,
  dedicatedCustomerEmail,
  dedicatedTransferProblems,
  heldReturnConfirmationProblems,
  isUnfinishedVerification,
  normalizeNigerianPhone,
  pickDedicatedAccount,
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

  const named: DedicatedTransferCheck = { ...good, expectedCustomerCode: "CUS_ada", expectedAccountNumber: "1234567890" }

  it("quarantines a transfer Paystack attributes to a different customer or account", () => {
    expect(dedicatedTransferProblems({ ...named, verified: { ...named.verified, customerCode: "CUS_bola" } }))
      .toEqual(["Paystack attributes the transfer to a different customer than this dedicated account"])
    expect(dedicatedTransferProblems({ ...named, verified: { ...named.verified, receiverAccountNumber: "0987654321" } }))
      .toEqual(["Paystack reports a different receiving account than this dedicated account"])
  })

  it("passes when Paystack confirms the same customer and account", () => {
    expect(dedicatedTransferProblems({ ...named, verified: { ...named.verified, customerCode: "CUS_ada", receiverAccountNumber: "1234567890" } }))
      .toEqual([])
  })

  it("treats a value Paystack did not return as no evidence either way", () => {
    expect(dedicatedTransferProblems(named)).toEqual([])
  })
})

describe("which dedicated account a transfer was paid into", () => {
  const old = { id: "old", accountNumber: "1111111111", providerCustomerCode: "CUS_ada", status: "DEACTIVATED", createdAt: new Date("2026-01-01") }
  const current = { id: "new", accountNumber: "2222222222", providerCustomerCode: "CUS_ada", status: "ACTIVE", createdAt: new Date("2026-06-01") }
  const other = { id: "bola", accountNumber: "3333333333", providerCustomerCode: "CUS_bola", status: "ACTIVE", createdAt: new Date("2026-02-01") }

  it("takes the account the money was paid into, even over the customer's other account", () => {
    expect(pickDedicatedAccount([old, current], { receiverAccountNumber: "2222222222", customerCode: "CUS_ada" })?.id).toBe("new")
    expect(pickDedicatedAccount([current, old], { receiverAccountNumber: "1111111111", customerCode: "CUS_ada" })?.id).toBe("old")
  })

  it("without an account number, prefers the customer's active account, then its newest", () => {
    expect(pickDedicatedAccount([old, current], { receiverAccountNumber: null, customerCode: "CUS_ada" })?.id).toBe("new")
    const older = { ...old, id: "older", createdAt: new Date("2025-01-01") }
    expect(pickDedicatedAccount([older, old], { receiverAccountNumber: null, customerCode: "CUS_ada" })?.id).toBe("old")
  })

  it("never takes another customer's account on the customer code", () => {
    expect(pickDedicatedAccount([other], { receiverAccountNumber: null, customerCode: "CUS_ada" })).toBeNull()
    expect(pickDedicatedAccount([other, current], { receiverAccountNumber: "9999999999", customerCode: "CUS_ada" })?.id).toBe("new")
  })

  it("finds nothing with nothing to go on", () => {
    expect(pickDedicatedAccount([old, current], { receiverAccountNumber: null, customerCode: null })).toBeNull()
  })
})

describe("an unfinished verification", () => {
  it("is retried rather than judged", () => {
    for (const status of ["pending", "ongoing", "processing", "queued", " Pending "]) expect(isUnfinishedVerification(status)).toBe(true)
  })

  it("does not cover outcomes", () => {
    for (const status of ["success", "failed", "reversed", "abandoned"]) expect(isUnfinishedVerification(status)).toBe(false)
  })
})

describe("confirming held money was returned", () => {
  it("needs a return to have been recorded first", () => {
    expect(heldReturnConfirmationProblems({ returnRequestedBy: null, actorUserId: "u1" }))
      .toEqual(["Record how the money was returned before it can be confirmed"])
  })

  it("refuses the person who recorded it", () => {
    expect(heldReturnConfirmationProblems({ returnRequestedBy: "u1", actorUserId: "u1" }))
      .toEqual(["A different person must confirm a return you recorded"])
  })

  it("allows anyone else", () => {
    expect(heldReturnConfirmationProblems({ returnRequestedBy: "u1", actorUserId: "u2" })).toEqual([])
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
