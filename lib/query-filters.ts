/**
 * Filters that live in the query string.
 *
 * Every filtered screen in the app keeps its state in the URL rather than in component
 * state, which is what makes a filtered list linkable, walkable with the back button, and —
 * the part that matters on a finance screen — printable and exportable as exactly what is on
 * screen, because the server read the same query string the table did.
 *
 * These are the pieces every such screen needs: read a parameter safely, build the link that
 * changes one filter, and count how many are on.
 */

export type FilterValues = Record<string, string | undefined>

/** A select cannot hold an empty value, so "no filter" travels as this and is stripped here. */
export const ANY = "ANY"

/**
 * One parameter, or undefined when it is absent, blank or the "no filter" sentinel.
 *
 * `searchParams` hands over `string | string[] | undefined` — a repeated parameter arrives as
 * an array — so the first value wins rather than the page crashing on `?termId=a&termId=b`.
 */
export function readParam(
  raw: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  // `raw?.` rather than `raw.`: a route can be rendered with no search parameters at all —
  // a prefetch, or a re-render inside an error boundary — and `searchParams` is then
  // undefined. Reading a key off it threw, which the dashboard error boundary caught, so
  // every screen in the app came up as an empty shell until this was guarded.
  const value = raw?.[key]
  const first = Array.isArray(value) ? value[0] : value
  const trimmed = first?.trim()
  return trimmed && trimmed !== ANY ? trimmed : undefined
}

/** The same filters as a link, with `overrides` applied. An `undefined` override clears one. */
export function filterHref<T extends FilterValues>(
  basePath: string,
  values: T,
  overrides: Partial<Record<keyof T & string, string | undefined>> = {},
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...values, ...overrides })) {
    if (value) params.set(key, value)
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/** How many filters are on — for a "Clear all" that only appears when there is something to clear. */
export function countActive(values: FilterValues): number {
  return Object.values(values).filter(Boolean).length
}

/** `yyyy-mm-dd`, and a real day: `2026-02-31` parses but is not a date anyone meant. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/**
 * Keeps a session filter and a term filter from contradicting each other.
 *
 * Every period-filtered screen in the school offers both, and choosing a term settles which
 * session it belongs to. A stale `sessionId` left in the URL is therefore corrected rather
 * than intersected with it — otherwise picking Second Term while last year's session is
 * still selected returns nothing, and the page gives no hint why. A term the school does not
 * have is dropped: it is usually a bookmark from a school year that has been removed.
 */
export function reconcileSessionTerm<T extends { sessionId?: string; termId?: string }>(
  values: T,
  terms: Array<{ id: string; sessionId: string }> = [],
): T {
  if (!values.termId) return values

  const term = terms.find((entry) => entry.id === values.termId)
  if (!term) {
    const { termId: _dropped, ...rest } = values
    return rest as T
  }

  return { ...values, sessionId: term.sessionId }
}
