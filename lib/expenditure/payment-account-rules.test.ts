import { describe, expect, it } from "vitest"

import {
  canClosePaymentAccount,
  canDeletePaymentAccount,
  canUsePaymentAccountName,
  openingBalanceShift,
} from "@/lib/expenditure/payment-account-rules"

const taken = [
  { id: "cash", name: "Cash Office" },
  { id: "bank", name: "Main Bank Account" },
]

describe("canUsePaymentAccountName", () => {
  it("accepts a name nothing else holds", () => {
    expect(canUsePaymentAccountName("PTA Account", taken)).toEqual({ allowed: true })
  })

  it("refuses a name that is too short to mean anything", () => {
    const verdict = canUsePaymentAccountName("A", taken)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("two characters")
  })

  it("refuses a clash regardless of case or surrounding space", () => {
    const verdict = canUsePaymentAccountName("  cash office ", taken)
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("Cash Office already exists")
  })

  it("lets an account keep its own name while being edited", () => {
    expect(canUsePaymentAccountName("Cash Office", taken, "cash")).toEqual({ allowed: true })
  })
})

describe("canClosePaymentAccount", () => {
  it("allows closing an account with nothing waiting on it", () => {
    expect(canClosePaymentAccount({ unpaidExpenseCount: 0 })).toEqual({ allowed: true })
  })

  it("refuses while a voucher still has to be paid from it", () => {
    const verdict = canClosePaymentAccount({ unpaidExpenseCount: 1 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("1 voucher is still waiting")
  })

  it("counts plurally, because the reason is read by a person", () => {
    const verdict = canClosePaymentAccount({ unpaidExpenseCount: 3 })
    expect(verdict.allowed === false && verdict.reason).toContain("3 vouchers are still waiting")
  })
})

describe("canDeletePaymentAccount", () => {
  const clean = { expenseCount: 0, salaryPaymentCount: 0, staffConfigCount: 0 }

  it("allows deleting an account nothing has ever touched", () => {
    expect(canDeletePaymentAccount(clean)).toEqual({ allowed: true })
  })

  it("refuses once a voucher names it, and says to close it instead", () => {
    const verdict = canDeletePaymentAccount({ ...clean, expenseCount: 15 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("15 vouchers have been raised")
    expect(verdict.allowed === false && verdict.reason).toContain("Close it instead")
  })

  it("refuses on salary payments, which point at the account too", () => {
    const verdict = canDeletePaymentAccount({ ...clean, salaryPaymentCount: 2 })
    expect(verdict.allowed === false && verdict.reason).toContain("2 salary payments were made")
  })

  it("refuses while staff are configured to be paid from it", () => {
    const verdict = canDeletePaymentAccount({ ...clean, staffConfigCount: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 staff member is set to be paid")
  })

  it("reports the voucher reason first when several apply", () => {
    const verdict = canDeletePaymentAccount({ expenseCount: 1, salaryPaymentCount: 1, staffConfigCount: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("voucher has been raised")
  })
})

describe("openingBalanceShift", () => {
  it("says nothing when the figure is unchanged", () => {
    expect(openingBalanceShift("150000.00", "150000")).toBeNull()
  })

  it("reports an increase and its size", () => {
    expect(openingBalanceShift("150000.00", "200000")).toEqual({ delta: 50000, direction: "up" })
  })

  it("reports a decrease as a positive amount in the other direction", () => {
    expect(openingBalanceShift("150000.00", "100000")).toEqual({ delta: 50000, direction: "down" })
  })

  it("says nothing rather than NaN when the new figure is not a number yet", () => {
    expect(openingBalanceShift("150000.00", "")).toEqual({ delta: 150000, direction: "down" })
    expect(openingBalanceShift("150000.00", "abc")).toBeNull()
  })
})
