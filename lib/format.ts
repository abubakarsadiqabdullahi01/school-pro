export function formatDate(value: Date | string | number | null | undefined) {
  if (!value) return "Not specified"

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * `29 Sep 2026` — always eleven characters, for a date sitting in a column on a document.
 *
 * `toLocaleDateString` is not fixed width: the default US format runs from `1/2/2026` to
 * `12/29/2026`, and a short month under en-GB renders September as "Sept". Either way one
 * row in a date column is wider than the rest, so the column has to be sized for the worst
 * case or the date wraps into whatever sits beside it. Receipts, statements and registers
 * all read from this so a figure means the same thing on every page the school hands out.
 */
export function formatDocumentDate(value: Date | string | number) {
  // `new Date("2026-09-01")` is midnight UTC, which is the day before in the Americas, while
  // `new Date("2026-09-01T09:00")` is local. A bare date from a form or a query string means
  // that calendar day wherever it is read, so it is built from its own parts.
  const dateOnly = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : value instanceof Date
      ? value
      : new Date(value)
  if (Number.isNaN(date.getTime())) return "Invalid date"

  const day = String(date.getDate()).padStart(2, "0")
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * `29 Sep 2026, 11:20` — the same date, with the clock, for a log rather than a document.
 *
 * Two integrity runs on the same morning are only told apart by the time, and a bare
 * `toLocaleString()` gives "9/20/2026, 11:20:19 AM" to one reader and "20/09/2026, 11:20:19"
 * to another. Seconds are dropped: nobody reconciles to the second, and they make a column
 * of timestamps harder to scan.
 */
export function formatDocumentDateTime(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Invalid date"

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${formatDocumentDate(date)}, ${hours}:${minutes}`
}
