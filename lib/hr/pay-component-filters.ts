import { ANY, countActive, filterHref, readParam } from "@/lib/query-filters"

/**
 * Filters for the three pay-setup lists: salary scales, allowances, deductions.
 *
 * All three were a create form stacked above a table with a single in-table search box and
 * no way to see, for instance, which allowances nobody is on. They are separate screens now,
 * and they share this one module because the questions asked of them are the same: what kind
 * of thing is it, is it still live, and is anybody actually on it.
 */

export { ANY }

export const COMPONENT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "RETIRED", label: "Retired" },
] as const

/** A fixed naira amount, or a percentage of base salary. */
export const COMPONENT_KINDS = [
  { value: "FIXED", label: "Fixed amount" },
  { value: "PERCENTAGE", label: "Percentage" },
] as const

/** Whether a deduction comes off before or after tax is worked out. */
export const DEDUCTION_TIMINGS = [
  { value: "PRE_TAX", label: "Before tax" },
  { value: "POST_TAX", label: "After tax" },
] as const

/** Whether anybody is on it. An unused component is new, or a leftover from last year. */
export const COMPONENT_USAGE = [
  { value: "IN_USE", label: "In use" },
  { value: "UNUSED", label: "Nobody on it" },
] as const

export type PayComponentFilters = {
  search?: string
  status?: string
  kind?: string
  timing?: string
  usage?: string
}

export type PayComponentChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

export function parsePayComponentFilters(
  raw: Record<string, string | string[] | undefined>,
): PayComponentFilters {
  return {
    search: readParam(raw, "search"),
    status: oneOf(readParam(raw, "status"), COMPONENT_STATUSES),
    kind: oneOf(readParam(raw, "kind"), COMPONENT_KINDS),
    timing: oneOf(readParam(raw, "timing"), DEDUCTION_TIMINGS),
    usage: oneOf(readParam(raw, "usage"), COMPONENT_USAGE),
  }
}

export function countPayComponentFilters(filters: PayComponentFilters): number {
  return countActive(filters)
}

export function payComponentFilterHref(
  basePath: string,
  filters: PayComponentFilters,
  overrides: Partial<Record<keyof PayComponentFilters, string | undefined>> = {},
): string {
  return filterHref(basePath, filters, overrides)
}

export function payComponentChips(filters: PayComponentFilters): PayComponentChip[] {
  const chips: PayComponentChip[] = []

  if (filters.search) chips.push({ key: "search", label: "Search", value: filters.search })
  if (filters.status) {
    chips.push({ key: "status", label: "Status", value: labelOf(filters.status, COMPONENT_STATUSES) })
  }
  if (filters.kind) {
    chips.push({ key: "kind", label: "Type", value: labelOf(filters.kind, COMPONENT_KINDS) })
  }
  if (filters.timing) {
    chips.push({ key: "timing", label: "Applies", value: labelOf(filters.timing, DEDUCTION_TIMINGS) })
  }
  if (filters.usage) {
    chips.push({ key: "usage", label: "Use", value: labelOf(filters.usage, COMPONENT_USAGE) })
  }

  return chips
}

/** What the screen is showing, in one line — for the card description and a printed copy. */
export function describePayComponentFilters(filters: PayComponentFilters, plural: string): string {
  const chips = payComponentChips(filters)
  if (chips.length === 0) return `All ${plural}`
  return chips.map((chip) => `${chip.label}: ${chip.value}`).join(" · ")
}

export function componentKindLabel(value: string): string {
  return labelOf(value, COMPONENT_KINDS)
}

export function deductionTimingLabel(value: string): string {
  return labelOf(value, DEDUCTION_TIMINGS)
}

/** `20%` or `₦15,000.00` — a percentage and an amount must not look alike in a column. */
export function componentValueLabel(
  kind: string,
  value: string,
  formatMoney: (value: string) => string,
): string {
  return kind === "PERCENTAGE" ? `${Number(value)}%` : formatMoney(value)
}

/**
 * The status, kind, timing and usage filters applied in memory.
 *
 * Status, kind and timing could be `where` clauses, but usage counts rows in another table
 * and the lists are small enough to read whole — so all four are applied in one place
 * against exactly the reading the table shows, which is also the reading the chips describe.
 */
export function matchesPayComponent(
  row: { isActive: boolean; kind?: string; timing?: string; assignedCount: number },
  filters: PayComponentFilters,
): boolean {
  if (filters.status === "ACTIVE" && !row.isActive) return false
  if (filters.status === "RETIRED" && row.isActive) return false

  if (filters.kind && row.kind !== filters.kind) return false
  if (filters.timing && row.timing !== filters.timing) return false

  if (filters.usage === "IN_USE" && row.assignedCount === 0) return false
  if (filters.usage === "UNUSED" && row.assignedCount > 0) return false

  return true
}
