import { describe, expect, it } from "vitest"

import {
  canDeleteFinanceOfficer,
  canUseOfficerEmail,
  describeFinanceOfficerDeletion,
} from "./finance-staff-rules"

describe("canDeleteFinanceOfficer", () => {
  it("allows removing an account that has never been used", () => {
    expect(canDeleteFinanceOfficer({ paymentsRecorded: 0, adjustmentsApproved: 0 })).toEqual({
      allowed: true,
    })
  })

  it("refuses once they have issued a receipt, and says what would break", () => {
    const verdict = canDeleteFinanceOfficer({ paymentsRecorded: 137, adjustmentsApproved: 0 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("137 receipts")
    expect(verdict.allowed === false && verdict.reason).toContain("Revoke access instead")
  })

  it("refuses where they approved an adjustment", () => {
    const verdict = canDeleteFinanceOfficer({ paymentsRecorded: 0, adjustmentsApproved: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 discount or exemption")
  })

  it("names the receipts first when both apply", () => {
    const verdict = canDeleteFinanceOfficer({ paymentsRecorded: 2, adjustmentsApproved: 3 })
    expect(verdict.allowed === false && verdict.reason).toContain("2 receipts")
  })
})

describe("describeFinanceOfficerDeletion", () => {
  it("says plainly that nothing else refers to the account", () => {
    expect(describeFinanceOfficerDeletion("Bashir Garba")).toContain("Bashir Garba")
  })
})

describe("canUseOfficerEmail", () => {
  const taken = [
    { userId: "u1", email: "bashir@brightfield.edu.ng" },
    { userId: "u2", email: "ngozi@brightfield.edu.ng" },
  ]

  it("accepts an address nobody holds", () => {
    expect(canUseOfficerEmail("new.officer@brightfield.edu.ng", taken)).toEqual({ allowed: true })
  })

  it("refuses a clash whatever the case and spacing", () => {
    expect(canUseOfficerEmail("  BASHIR@brightfield.edu.ng ", taken)).toEqual({
      allowed: false,
      reason: "That email is already in use.",
    })
  })

  it("does not count the officer being edited as their own clash", () => {
    expect(canUseOfficerEmail("bashir@brightfield.edu.ng", taken, "u1")).toEqual({ allowed: true })
  })

  it("refuses something that is not an address", () => {
    expect(canUseOfficerEmail("bashir at school", taken).allowed).toBe(false)
    expect(canUseOfficerEmail("", taken)).toEqual({
      allowed: false,
      reason: "An email address is needed to sign in.",
    })
  })
})
