import { PAYMENT_METHODS } from "@/lib/finance/payment-method"
import { formatDocumentDate } from "@/lib/format"
import {
  ANY,
  countActive,
  filterHref,
  isCalendarDate,
  readParam,
  reconcileSessionTerm,
} from "@/lib/query-filters"

/**
 * The receipt register's filters.
 *
 * They live here rather than in the page because three places have to agree on them: the
 * server action that queries, the filter bar that offers them, and the printed header that
 * has to say what the reader is looking at. A register handed to an auditor showing ten of
 * four hundred receipts, with nothing on the page saying so, is worse than no register.
 *
 * Everything arrives from the query string, so everything is suspect: values are checked
 * against the lists below and anything unrecognised is dropped rather than passed to the
 * database or echoed back into the page.
 */

export { ANY }

export { PAYMENT_METHODS }

export const PAYMENT_STATUSES = [
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Awaiting confirmation" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
] as const

export type ReceiptFilters = {
  sessionId?: string
  termId?: string
  method?: string
  status?: string
  cashierId?: string
  /** `yyyy-mm-dd`, inclusive. */
  from?: string
  /** `yyyy-mm-dd`, inclusive. */
  to?: string
  search?: string
}

export type ReceiptFilterLookups = {
  sessions?: Array<{ id: string; name: string }>
  terms?: Array<{ id: string; name: string; sessionId: string }>
  cashiers?: Array<{ id: string; name: string }>
}

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

export function parseReceiptFilters(raw: Record<string, string | string[] | undefined>): ReceiptFilters {
  const read = (key: string) => readParam(raw, key)

  const date = (key: string) => {
    const value = read(key)
    return value && isCalendarDate(value) ? value : undefined
  }

  let from = date("from")
  let to = date("to")
  // A range typed the wrong way round is a slip at the keyboard, not a request for nothing.
  if (from && to && from > to) [from, to] = [to, from]

  return {
    sessionId: read("sessionId"),
    termId: read("termId"),
    method: oneOf(read("method"), PAYMENT_METHODS),
    status: oneOf(read("status"), PAYMENT_STATUSES),
    cashierId: read("cashierId"),
    from,
    to,
    search: read("search"),
  }
}

/**
 * Keeps the session and the term from contradicting each other.
 *
 * Choosing a term settles which session it belongs to, so a stale `sessionId` left in the
 * URL is corrected rather than intersected — otherwise picking Second Term while last year's
 * session is still selected returns nothing, and the page gives no hint why.
 */
export function reconcilePeriod(filters: ReceiptFilters, terms: ReceiptFilterLookups["terms"] = []): ReceiptFilters {
  return reconcileSessionTerm(filters, terms)
}

export function countActiveFilters(filters: ReceiptFilters): number {
  return countActive(filters)
}

export type ReceiptFilterChip = {
  /** The query key this chip owns, so removing it is a matter of clearing that key. */
  key: keyof ReceiptFilters
  label: string
  value: string
}

/**
 * One chip per active filter, in the order a reader would say them aloud.
 *
 * A date range is a single chip: "from" and "to" are two halves of one idea, and removing
 * half of a range is never what anyone means.
 */
export function receiptFilterChips(
  filters: ReceiptFilters,
  lookups: ReceiptFilterLookups = {},
): ReceiptFilterChip[] {
  const chips: ReceiptFilterChip[] = []
  const { sessions = [], terms = [], cashiers = [] } = lookups

  const term = filters.termId ? terms.find((entry) => entry.id === filters.termId) : undefined
  // A term names its own session even when the filters do not: "Third Term" exists once per
  // session, and a printed header that does not say which one is not a record of anything.
  const sessionId = term?.sessionId ?? filters.sessionId
  const session = sessionId ? sessions.find((entry) => entry.id === sessionId) : undefined

  // A term already names its session, so showing both says the same thing twice.
  if (term) {
    chips.push({ key: "termId", label: "Term", value: session ? `${term.name} · ${session.name}` : term.name })
  } else if (session) {
    chips.push({ key: "sessionId", label: "Session", value: session.name })
  }

  if (filters.method) {
    chips.push({
      key: "method",
      label: "Method",
      value: PAYMENT_METHODS.find((option) => option.value === filters.method)?.label ?? filters.method,
    })
  }

  if (filters.status) {
    chips.push({
      key: "status",
      label: "Status",
      value: PAYMENT_STATUSES.find((option) => option.value === filters.status)?.label ?? filters.status,
    })
  }

  if (filters.cashierId) {
    const cashier = cashiers.find((entry) => entry.id === filters.cashierId)
    chips.push({ key: "cashierId", label: "Received by", value: cashier?.name ?? "Selected cashier" })
  }

  if (filters.from || filters.to) {
    const from = filters.from ? formatDocumentDate(filters.from) : null
    const to = filters.to ? formatDocumentDate(filters.to) : null
    chips.push({
      key: "from",
      label: "Dates",
      value: from && to ? `${from} – ${to}` : from ? `From ${from}` : `Up to ${to}`,
    })
  }

  if (filters.search) {
    chips.push({ key: "search", label: "Matching", value: `“${filters.search}”` })
  }

  return chips
}

/**
 * What the printed header and the export file are called.
 *
 * The printed page carries no filter bar, so this line is the only record of which slice of
 * the register somebody is holding.
 */
export function describeReceiptFilters(filters: ReceiptFilters, lookups: ReceiptFilterLookups = {}): string {
  const chips = receiptFilterChips(filters, lookups)
  return chips.length === 0 ? "All receipts" : chips.map((chip) => chip.value).join(" · ")
}

/** The same filters as a query string, with `overrides` applied. `undefined` clears a key. */
export function receiptFilterHref(
  basePath: string,
  filters: ReceiptFilters,
  overrides: Partial<Record<keyof ReceiptFilters, string | undefined>> = {},
): string {
  // Clearing the start of a range clears the range: half a range filters to something
  // nobody asked for, which is how a chip's "remove" would otherwise mislead.
  const withRange =
    overrides.from === undefined && "from" in overrides ? { ...overrides, to: undefined } : overrides

  return filterHref(basePath, filters, withRange)
}
