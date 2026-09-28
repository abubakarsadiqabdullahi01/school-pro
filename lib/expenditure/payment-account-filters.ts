import { ANY, countActive, filterHref, readParam } from "@/lib/query-filters"

/**
 * Filters for the payment chart.
 *
 * The chart is where money leaves from — the cash office, the main bank account, the PTA
 * account, petty cash. Two accounts is a demo; a real school carries a dozen, half of them
 * closed years ago, and the questions asked of the list are always the same four: what kind
 * of account, is it still open, is it overdrawn, and has anything ever been paid from it.
 *
 * Those are the filters. They live in the query string like every other filtered screen, so
 * a narrowed chart is a link somebody can be sent.
 */

export { ANY }

export const PAYMENT_ACCOUNT_TYPES = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank account" },
  { value: "POS", label: "POS" },
  { value: "WALLET", label: "Wallet" },
  { value: "OTHER", label: "Other" },
] as const

export const PAYMENT_ACCOUNT_STATUSES = [
  { value: "ACTIVE", label: "Open" },
  { value: "CLOSED", label: "Closed" },
] as const

/** What the balance is doing. Overdrawn is the one anybody goes looking for. */
export const PAYMENT_ACCOUNT_BALANCES = [
  { value: "OVERDRAWN", label: "Overdrawn" },
  { value: "IN_FUNDS", label: "In funds" },
  { value: "EMPTY", label: "Nothing left" },
] as const

/** Whether anything has ever been paid out of it. An unused account is new or abandoned. */
export const PAYMENT_ACCOUNT_ACTIVITY = [
  { value: "USED", label: "Has payments" },
  { value: "UNUSED", label: "Never used" },
] as const

export type PaymentAccountFilters = {
  search?: string
  type?: string
  status?: string
  balance?: string
  activity?: string
}

export type PaymentAccountChip = { key: string; label: string; value: string }

const oneOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string }>) =>
  value && allowed.some((option) => option.value === value) ? value : undefined

const labelOf = (value: string | undefined, allowed: ReadonlyArray<{ value: string; label: string }>) =>
  allowed.find((option) => option.value === value)?.label ?? value ?? ""

export function parsePaymentAccountFilters(
  raw: Record<string, string | string[] | undefined>,
): PaymentAccountFilters {
  return {
    search: readParam(raw, "search"),
    type: oneOf(readParam(raw, "type"), PAYMENT_ACCOUNT_TYPES),
    status: oneOf(readParam(raw, "status"), PAYMENT_ACCOUNT_STATUSES),
    balance: oneOf(readParam(raw, "balance"), PAYMENT_ACCOUNT_BALANCES),
    activity: oneOf(readParam(raw, "activity"), PAYMENT_ACCOUNT_ACTIVITY),
  }
}

export function countPaymentAccountFilters(filters: PaymentAccountFilters): number {
  return countActive(filters)
}

export function paymentAccountFilterHref(
  basePath: string,
  filters: PaymentAccountFilters,
  overrides: Partial<Record<keyof PaymentAccountFilters, string | undefined>> = {},
): string {
  return filterHref(basePath, filters, overrides)
}

export function paymentAccountChips(filters: PaymentAccountFilters): PaymentAccountChip[] {
  const chips: PaymentAccountChip[] = []

  if (filters.search) chips.push({ key: "search", label: "Search", value: filters.search })
  if (filters.type) {
    chips.push({ key: "type", label: "Type", value: labelOf(filters.type, PAYMENT_ACCOUNT_TYPES) })
  }
  if (filters.status) {
    chips.push({ key: "status", label: "Status", value: labelOf(filters.status, PAYMENT_ACCOUNT_STATUSES) })
  }
  if (filters.balance) {
    chips.push({ key: "balance", label: "Balance", value: labelOf(filters.balance, PAYMENT_ACCOUNT_BALANCES) })
  }
  if (filters.activity) {
    chips.push({ key: "activity", label: "Use", value: labelOf(filters.activity, PAYMENT_ACCOUNT_ACTIVITY) })
  }

  return chips
}

/** What the screen is showing, in one line — for the card description and a printed copy. */
export function describePaymentAccountFilters(filters: PaymentAccountFilters): string {
  const chips = paymentAccountChips(filters)
  if (chips.length === 0) return "All accounts"
  return chips.map((chip) => `${chip.label}: ${chip.value}`).join(" · ")
}

/** The label a type code reads as. Exported because the table and the detail both need it. */
export function paymentAccountTypeLabel(value: string): string {
  return labelOf(value, PAYMENT_ACCOUNT_TYPES)
}

/**
 * The balance and activity filters applied in memory.
 *
 * Both are derived figures — a balance is an opening figure minus everything paid out of the
 * account, computed on read — so neither can be a `where` clause. They are applied here so
 * the screen and any later caller filter on exactly the same reading.
 */
export function matchesDerivedFilters(
  account: { balance: string | number; paidCount: number },
  filters: PaymentAccountFilters,
): boolean {
  const balance = Number(account.balance)

  if (filters.balance === "OVERDRAWN" && !(balance < 0)) return false
  if (filters.balance === "IN_FUNDS" && !(balance > 0)) return false
  if (filters.balance === "EMPTY" && balance !== 0) return false

  // Counted on payments rather than vouchers: an account whose only voucher was rejected
  // has still never had money leave it.
  if (filters.activity === "USED" && account.paidCount === 0) return false
  if (filters.activity === "UNUSED" && account.paidCount > 0) return false

  return true
}
