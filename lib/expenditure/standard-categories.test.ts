import { describe, expect, it } from "vitest"

import {
  pickSalaryCategory,
  SALARY_CATEGORY_NAME,
  STANDARD_EXPENSE_CATEGORIES,
} from "./standard-categories"

const row = (id: string, name: string, isActive = true) => ({ id, name, isActive })

describe("the standard expenditure chart", () => {
  it("has no two headings a school would read as the same", () => {
    const names = STANDARD_EXPENSE_CATEGORIES.map((category) => category.name.trim().toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it("starts with the heading payroll books under", () => {
    expect(STANDARD_EXPENSE_CATEGORIES[0].name).toBe(SALARY_CATEGORY_NAME)
  })
})

describe("pickSalaryCategory", () => {
  it("prefers the standard heading", () => {
    const picked = pickSalaryCategory([row("a", "Salaries"), row("b", "Salaries and Wages")])
    expect(picked?.id).toBe("b")
  })

  it("falls back to the older 'Salaries' heading", () => {
    expect(pickSalaryCategory([row("a", "Utilities"), row("b", "salaries ")])?.id).toBe("b")
  })

  it("takes any active heading about pay when neither name exists", () => {
    expect(pickSalaryCategory([row("a", "Staff Wages")])?.id).toBe("a")
  })

  it("never books salaries under a retired heading", () => {
    expect(pickSalaryCategory([row("a", "Salaries and Wages", false)])).toBeNull()
  })

  it("returns null when the school has no salary heading at all", () => {
    expect(pickSalaryCategory([row("a", "Utilities")])).toBeNull()
  })
})
