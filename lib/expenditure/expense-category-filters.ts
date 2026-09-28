import { ANY, countActive, filterHref, readParam } from "@/lib/query-filters"

/**
 * Filters for the expense categories.
 *
 * A category is the heading spending is grouped and reported under, and the thing a termly
 * budget is set against. So the questions asked of the list are: which ones carry a limit,
 * which are over it this term, which are still in use, and which were retired years ago.
 *
 * Same plumbing as the payment chart — the state lives in the query string, so a narrowed
 * list is a link somebody can be sent.
 */

export { ANY }

export const EXPENSE_CATEGORY_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "RETIRED", label: "Retired" },
] as const

/** Whether a termly ceiling is set, and whether this term has passed it. */
export const EXPENSE_CATEGORY_BUDGETS = [
  { value: "HAS_LIMIT", label: "Has a limit" },
  { value: "NO_LIMIT", label: "No limit" },
  { value: "OVER", label: "Over this term" },
] as const

/** Whether anything has ever been charged to it. An unused category is new or abandoned. */
export const EXPENSE_CATEGORY_USAGE = [
  { value: "USED", label: "Has vouchers" },
  { value: "UNUSED", label: "Never used" },
] as const

export type ExpenseCategoryFilters = {
  search?: string
  status?: string
  budget?: string
  usage?: string
}

export type ExpenseCategoryChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

export function parseExpenseCategoryFilters(
  raw: Record<string, string | string[] | undefined>,
): ExpenseCategoryFilters {
  return {
    search: readParam(raw, "search"),
    status: oneOf(readParam(raw, "status"), EXPENSE_CATEGORY_STATUSES),
    budget: oneOf(readParam(raw, "budget"), EXPENSE_CATEGORY_BUDGETS),
    usage: oneOf(readParam(raw, "usage"), EXPENSE_CATEGORY_USAGE),
  }
}

export function countExpenseCategoryFilters(filters: ExpenseCategoryFilters): number {
  return countActive(filters)
}

export function expenseCategoryFilterHref(
  basePath: string,
  filters: ExpenseCategoryFilters,
  overrides: Partial<Record<keyof ExpenseCategoryFilters, string | undefined>> = {},
): string {
  return filterHref(basePath, filters, overrides)
}

export function expenseCategoryChips(filters: ExpenseCategoryFilters): ExpenseCategoryChip[] {
  const chips: ExpenseCategoryChip[] = []

  if (filters.search) chips.push({ key: "search", label: "Search", value: filters.search })
  if (filters.status) {
    chips.push({ key: "status", label: "Status", value: labelOf(filters.status, EXPENSE_CATEGORY_STATUSES) })
  }
  if (filters.budget) {
    chips.push({ key: "budget", label: "Budget", value: labelOf(filters.budget, EXPENSE_CATEGORY_BUDGETS) })
  }
  if (filters.usage) {
    chips.push({ key: "usage", label: "Use", value: labelOf(filters.usage, EXPENSE_CATEGORY_USAGE) })
  }

  return chips
}

/** What the screen is showing, in one line — for the card description and a printed copy. */
export function describeExpenseCategoryFilters(filters: ExpenseCategoryFilters): string {
  const chips = expenseCategoryChips(filters)
  if (chips.length === 0) return "All categories"
  return chips.map((chip) => `${chip.label}: ${chip.value}`).join(" · ")
}

/**
 * How much of a category's termly ceiling is gone, as a percentage.
 *
 * Null when there is no ceiling, which is the normal case — a limit is opt-in, and a
 * category without one is not "0% used", it is simply not budgeted.
 */
export function budgetUsedPercent(limit: string | number | null, spent: string | number): number | null {
  const ceiling = Number(limit ?? 0)
  if (!limit || ceiling === 0) return null
  return Math.round((Number(spent) / ceiling) * 100)
}

/**
 * The filters that cannot be a `where` clause, applied in memory.
 *
 * "Over this term" is a comparison between a stored ceiling and a figure aggregated per term,
 * and "never used" counts rows in another table — so both are applied against exactly the
 * reading the table shows rather than being approximated in SQL.
 */
export function matchesCategoryUsage(
  category: { budgetLimit: string | null; termSpend: string; expenseCount: number },
  filters: ExpenseCategoryFilters,
): boolean {
  if (filters.budget === "OVER") {
    if (!category.budgetLimit) return false
    if (Number(category.termSpend) <= Number(category.budgetLimit)) return false
  }

  if (filters.usage === "USED" && category.expenseCount === 0) return false
  if (filters.usage === "UNUSED" && category.expenseCount > 0) return false

  return true
}
