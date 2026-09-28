import {
  ANY,
  countActive,
  filterHref,
  readParam,
  reconcileSessionTerm,
  type FilterValues,
} from "@/lib/query-filters"

/**
 * Filters for the two Fee Setup screens.
 *
 * Fee Setup used to be one page listing everything it had, which is workable for the four
 * categories and six schedules a demo school carries and unusable for a real one: a school
 * running three terms across two sessions has a schedule per category per term per class, and
 * finding "the one that bills SSS 3A for WAEC" meant reading the whole page.
 *
 * Categories and schedules are different objects with different questions asked of them, so
 * each has its own screen and its own filters. Both sets are checked here, because the query
 * string is public and its values reach a database query.
 */

export { ANY }

export const FEE_TYPES = [
  { value: "MANDATORY", label: "Mandatory" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "REGISTRATION", label: "Registration" },
  { value: "SERVICE", label: "Service" },
] as const

export const FEE_AUDIENCES = [
  { value: "ALL_STUDENTS", label: "All students" },
  { value: "NEW_STUDENTS", label: "New students only" },
  { value: "RETURNING_STUDENTS", label: "Returning students only" },
] as const

export const FEE_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const

/** How widely a schedule bills. Stored as which of `classTermId` and `termId` is set. */
export const FEE_SCOPES = [
  { value: "CLASS", label: "One class" },
  { value: "TERM", label: "All classes in a term" },
  { value: "SESSION", label: "Whole session" },
] as const

export type FeeCategoryFilters = {
  search?: string
  type?: string
  status?: string
}

export type FeeScheduleFilters = {
  search?: string
  sessionId?: string
  termId?: string
  categoryId?: string
  audience?: string
  scope?: string
  status?: string
}

export type FeeSetupLookups = {
  sessions?: Array<{ id: string; name: string }>
  terms?: Array<{ id: string; name: string; sessionId: string }>
  categories?: Array<{ id: string; name: string }>
}

export type FeeFilterChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

export function parseCategoryFilters(raw: Record<string, string | string[] | undefined>): FeeCategoryFilters {
  return {
    search: readParam(raw, "search"),
    type: oneOf(readParam(raw, "type"), FEE_TYPES),
    status: oneOf(readParam(raw, "status"), FEE_STATUSES),
  }
}

export function parseScheduleFilters(raw: Record<string, string | string[] | undefined>): FeeScheduleFilters {
  return {
    search: readParam(raw, "search"),
    sessionId: readParam(raw, "sessionId"),
    termId: readParam(raw, "termId"),
    categoryId: readParam(raw, "categoryId"),
    audience: oneOf(readParam(raw, "audience"), FEE_AUDIENCES),
    scope: oneOf(readParam(raw, "scope"), FEE_SCOPES),
    status: oneOf(readParam(raw, "status"), FEE_STATUSES),
  }
}

/** A term settles its own session; see `reconcileSessionTerm`. */
export function reconcileScheduleFilters(
  filters: FeeScheduleFilters,
  terms: FeeSetupLookups["terms"] = [],
): FeeScheduleFilters {
  return reconcileSessionTerm(filters, terms)
}

export function categoryFilterChips(filters: FeeCategoryFilters): FeeFilterChip[] {
  const chips: FeeFilterChip[] = []

  if (filters.type) chips.push({ key: "type", label: "Type", value: labelOf(filters.type, FEE_TYPES) })
  if (filters.status) chips.push({ key: "status", label: "Status", value: labelOf(filters.status, FEE_STATUSES) })
  if (filters.search) chips.push({ key: "search", label: "Matching", value: `“${filters.search}”` })

  return chips
}

export function scheduleFilterChips(
  filters: FeeScheduleFilters,
  lookups: FeeSetupLookups = {},
): FeeFilterChip[] {
  const chips: FeeFilterChip[] = []
  const { sessions = [], terms = [], categories = [] } = lookups

  const term = filters.termId ? terms.find((entry) => entry.id === filters.termId) : undefined
  // A term names its own session even when the filters do not: "Third Term" exists once per
  // session, and a heading that does not say which one is not a record of anything.
  const sessionId = term?.sessionId ?? filters.sessionId
  const session = sessionId ? sessions.find((entry) => entry.id === sessionId) : undefined

  if (term) {
    chips.push({ key: "termId", label: "Term", value: session ? `${term.name} · ${session.name}` : term.name })
  } else if (session) {
    chips.push({ key: "sessionId", label: "Session", value: session.name })
  }

  if (filters.categoryId) {
    const category = categories.find((entry) => entry.id === filters.categoryId)
    chips.push({ key: "categoryId", label: "Category", value: category?.name ?? "Selected category" })
  }

  if (filters.scope) chips.push({ key: "scope", label: "Scope", value: labelOf(filters.scope, FEE_SCOPES) })
  if (filters.audience) {
    chips.push({ key: "audience", label: "Applies to", value: labelOf(filters.audience, FEE_AUDIENCES) })
  }
  if (filters.status) chips.push({ key: "status", label: "Status", value: labelOf(filters.status, FEE_STATUSES) })
  if (filters.search) chips.push({ key: "search", label: "Matching", value: `“${filters.search}”` })

  return chips
}

/** What a filtered list of schedules is a list of, for a heading or an export. */
export function describeScheduleFilters(filters: FeeScheduleFilters, lookups: FeeSetupLookups = {}): string {
  const chips = scheduleFilterChips(filters, lookups)
  return chips.length === 0 ? "All fee schedules" : chips.map((chip) => chip.value).join(" · ")
}

export function countFeeFilters(filters: FilterValues): number {
  return countActive(filters)
}

export function feeFilterHref(
  basePath: string,
  filters: FilterValues,
  overrides: Record<string, string | undefined> = {},
): string {
  return filterHref(basePath, filters, overrides)
}
