import { describe, expect, it } from "vitest"

import {
  budgetLimitWarning,
  canDeleteExpenseCategory,
  canUseExpenseCategoryName,
  retireNote,
} from "@/lib/expenditure/expense-category-rules"

const taken = [
  { id: "util", name: "Utilities" },
  { id: "act", name: "School Activities" },
]

describe("canUseExpenseCategoryName", () => {
  it("accepts a name nothing else holds", () => {
    expect(canUseExpenseCategoryName("Transport", taken)).toEqual({ allowed: true })
  })

  it("refuses a name too short to mean anything", () => {
    const verdict = canUseExpenseCategoryName("U", taken)
    expect(verdict.allowed === false && verdict.reason).toContain("two characters")
  })

  it("refuses a clash regardless of case or surrounding space", () => {
    const verdict = canUseExpenseCategoryName(" utilities  ", taken)
    expect(verdict.allowed === false && verdict.reason).toContain("Utilities already exists")
  })

  it("lets a category keep its own name while being edited", () => {
    expect(canUseExpenseCategoryName("Utilities", taken, "util")).toEqual({ allowed: true })
  })
})

describe("retireNote", () => {
  it("says nothing when no voucher is in flight", () => {
    expect(retireNote({ unpaidExpenseCount: 0 })).toBeNull()
  })

  it("warns that vouchers under approval keep the retired label", () => {
    expect(retireNote({ unpaidExpenseCount: 1 })).toContain("1 voucher is still going through approval")
    expect(retireNote({ unpaidExpenseCount: 3 })).toContain("3 vouchers are still going through approval")
  })
})

describe("canDeleteExpenseCategory", () => {
  it("allows deleting a category nothing was charged to", () => {
    expect(canDeleteExpenseCategory({ expenseCount: 0 })).toEqual({ allowed: true })
  })

  it("refuses once a voucher reports under it, and says to retire instead", () => {
    const verdict = canDeleteExpenseCategory({ expenseCount: 9 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.allowed === false && verdict.reason).toContain("9 vouchers report under this category")
    expect(verdict.allowed === false && verdict.reason).toContain("Retire it instead")
  })

  it("reads correctly for a single voucher", () => {
    const verdict = canDeleteExpenseCategory({ expenseCount: 1 })
    expect(verdict.allowed === false && verdict.reason).toContain("1 voucher reports under this category")
  })
})

describe("budgetLimitWarning", () => {
  it("says nothing when the new ceiling is above what the term has spent", () => {
    expect(budgetLimitWarning("500000", "310000")).toBeNull()
  })

  it("says nothing when the limit is being removed", () => {
    expect(budgetLimitWarning(null, "310000")).toBeNull()
    expect(budgetLimitWarning("", "310000")).toBeNull()
  })

  it("warns when the new ceiling is already spent through", () => {
    expect(budgetLimitWarning("200000", "310000")).toContain("over budget straight away")
  })

  it("treats spending exactly the ceiling as within it", () => {
    expect(budgetLimitWarning("310000", "310000")).toBeNull()
  })
})
