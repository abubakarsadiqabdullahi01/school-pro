import { ANY, countActive, filterHref, readParam, reconcileSessionTerm } from "@/lib/query-filters"

/**
 * Session, term and class — the period filters every report shares.
 *
 * The class summary, the accumulated fund and the termly expenditure report are all read as
 * "how are we doing, and over what". They used to offer a row of buttons, one per term,
 * which had two problems: it grew by three every academic year, and "Third Term" appeared
 * twice with nothing to say which session each belonged to. A term names its session here,
 * and a class names its term.
 *
 * This lives outside `lib/finance` because expenditure asks the same question of the same
 * calendar; the answer should not be two implementations that drift.
 */

export { ANY }

export type PeriodFilterValues = {
  sessionId?: string
  termId?: string
  classTermId?: string
  search?: string
}

export type PeriodLookups = {
  sessions?: Array<{ id: string; name: string }>
  terms?: Array<{ id: string; name: string; sessionId: string }>
  classTerms?: Array<{ id: string; className: string; termName: string }>
}

export type PeriodChip = { key: string; label: string; value: string }

export function parsePeriodFilters(raw: Record<string, string | string[] | undefined>): PeriodFilterValues {
  return {
    sessionId: readParam(raw, "sessionId"),
    termId: readParam(raw, "termId"),
    classTermId: readParam(raw, "classTermId"),
    search: readParam(raw, "search"),
  }
}

/** A term settles its own session; see `reconcileSessionTerm`. */
export function reconcilePeriodFilters(
  filters: PeriodFilterValues,
  terms: PeriodLookups["terms"] = [],
): PeriodFilterValues {
  return reconcileSessionTerm(filters, terms)
}

export function periodFilterChips(filters: PeriodFilterValues, lookups: PeriodLookups = {}): PeriodChip[] {
  const chips: PeriodChip[] = []
  const { sessions = [], terms = [], classTerms = [] } = lookups

  const term = filters.termId ? terms.find((entry) => entry.id === filters.termId) : undefined
  // A term names its own session even when the filters do not: two sessions share the name,
  // and a report header that does not say which year is not a record of anything.
  const sessionId = term?.sessionId ?? filters.sessionId
  const session = sessionId ? sessions.find((entry) => entry.id === sessionId) : undefined

  if (term) {
    chips.push({ key: "termId", label: "Term", value: session ? `${term.name} · ${session.name}` : term.name })
  } else if (session) {
    chips.push({ key: "sessionId", label: "Session", value: session.name })
  }

  if (filters.classTermId) {
    const classTerm = classTerms.find((entry) => entry.id === filters.classTermId)
    chips.push({
      key: "classTermId",
      label: "Class",
      value: classTerm ? `${classTerm.className} · ${classTerm.termName}` : "Selected class",
    })
  }

  if (filters.search) {
    chips.push({ key: "search", label: "Matching", value: `“${filters.search}”` })
  }

  return chips
}

/** What the report on screen — and the printed copy of it — actually covers. */
export function describePeriodFilters(filters: PeriodFilterValues, lookups: PeriodLookups = {}): string {
  const chips = periodFilterChips(filters, lookups)
  return chips.length === 0 ? "All sessions and terms" : chips.map((chip) => chip.value).join(" · ")
}

export function countPeriodFilters(filters: PeriodFilterValues): number {
  return countActive(filters)
}

export function periodFilterHref(
  basePath: string,
  filters: PeriodFilterValues,
  overrides: Record<string, string | undefined> = {},
): string {
  return filterHref(basePath, filters, overrides)
}
