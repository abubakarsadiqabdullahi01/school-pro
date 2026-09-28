import { FEE_AUDIENCES } from "@/lib/finance/fee-setup-filters"
import { ANY, countActive, filterHref, readParam, reconcileSessionTerm } from "@/lib/query-filters"
import { formatNairaPlain } from "@/lib/money"

/**
 * The debtor chase-list's filters.
 *
 * The list answers one question — who owes, and how much — and the filters are the ways a
 * school narrows it before acting: this class, this term, only the ones who have paid
 * nothing, only balances above what is worth chasing. They are checked here because the
 * query string is public and every value reaches a database query, and because the printed
 * list has to say which slice of the school it is.
 */

export { ANY }

export const PAYMENT_STATES = [
  { value: "UNPAID", label: "Nothing paid" },
  { value: "PARTIAL", label: "Part paid" },
] as const

/** Reuses the fee audience wording: a debtor list is narrowed by the same two cohorts. */
export const STUDENT_TYPES = FEE_AUDIENCES.filter((option) => option.value !== "ALL_STUDENTS")

export type DebtorFilterValues = {
  sessionId?: string
  termId?: string
  classTermId?: string
  paymentStatus?: string
  studentType?: string
  minBalance?: string
  search?: string
}

export type DebtorLookups = {
  sessions?: Array<{ id: string; name: string }>
  terms?: Array<{ id: string; name: string; sessionId: string }>
  classTerms?: Array<{ id: string; className: string; termName: string }>
}

export type DebtorChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

/**
 * A minimum worth chasing, or nothing.
 *
 * A hand-edited `?minBalance=abc` must not become NaN in a Prisma comparison, and a negative
 * floor is not a filter — it is everybody.
 */
export function parseMinBalance(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function parseDebtorFilters(raw: Record<string, string | string[] | undefined>): DebtorFilterValues {
  const minBalance = readParam(raw, "minBalance")

  return {
    sessionId: readParam(raw, "sessionId"),
    termId: readParam(raw, "termId"),
    classTermId: readParam(raw, "classTermId"),
    paymentStatus: oneOf(readParam(raw, "paymentStatus"), PAYMENT_STATES),
    studentType: oneOf(readParam(raw, "studentType"), STUDENT_TYPES),
    minBalance: parseMinBalance(minBalance) ? minBalance : undefined,
    search: readParam(raw, "search"),
  }
}

/** A term settles its own session; see `reconcileSessionTerm`. */
export function reconcileDebtorFilters(
  filters: DebtorFilterValues,
  terms: DebtorLookups["terms"] = [],
): DebtorFilterValues {
  return reconcileSessionTerm(filters, terms)
}

export function debtorFilterChips(filters: DebtorFilterValues, lookups: DebtorLookups = {}): DebtorChip[] {
  const chips: DebtorChip[] = []
  const { sessions = [], terms = [], classTerms = [] } = lookups

  const term = filters.termId ? terms.find((entry) => entry.id === filters.termId) : undefined
  // A term names its own session: "Third Term" exists once per session, and a chase list
  // that does not say which year it is chasing is not one anybody can act on.
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

  if (filters.paymentStatus) {
    chips.push({ key: "paymentStatus", label: "Status", value: labelOf(filters.paymentStatus, PAYMENT_STATES) })
  }

  if (filters.studentType) {
    chips.push({ key: "studentType", label: "Students", value: labelOf(filters.studentType, STUDENT_TYPES) })
  }

  const minBalance = parseMinBalance(filters.minBalance)
  if (minBalance) {
    chips.push({ key: "minBalance", label: "Owes at least", value: formatNairaPlain(minBalance) })
  }

  if (filters.search) {
    chips.push({ key: "search", label: "Matching", value: `“${filters.search}”` })
  }

  return chips
}

/** What the printed chase list is a list of. */
export function describeDebtorFilters(filters: DebtorFilterValues, lookups: DebtorLookups = {}): string {
  const chips = debtorFilterChips(filters, lookups)
  return chips.length === 0 ? "All sessions and terms" : chips.map((chip) => chip.value).join(" · ")
}

export function countDebtorFilters(filters: DebtorFilterValues): number {
  return countActive(filters)
}

export function debtorFilterHref(
  basePath: string,
  filters: DebtorFilterValues,
  overrides: Record<string, string | undefined> = {},
): string {
  return filterHref(basePath, filters, overrides)
}
