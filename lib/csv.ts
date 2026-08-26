/**
 * CSV generation for report exports.
 *
 * Deliberately string-in, string-out: callers format money and dates on the server, where
 * the Decimal helpers live, and hand this the finished cells. That keeps `@prisma/client`
 * out of the client bundle that triggers the download.
 */

/**
 * Quotes a single cell per RFC 4180.
 *
 * A bare value is only safe when it holds no delimiter, quote or newline — a fee named
 * `Books, Term 1` would otherwise split into two columns. Quotes inside a quoted field are
 * escaped by doubling them.
 */
function escapeCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Builds a CSV document from a header row and body rows.
 *
 * CRLF line endings, as the spec requires — Excel on Windows is the usual destination and
 * is the least forgiving reader.
 */
export function toCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")
}

/**
 * A filename-safe slug for a downloaded export.
 *
 * Windows rejects `\ / : * ? " < > |` in filenames outright, and a report title like
 * `Debtors: First Term 2025/2026` carries three of them.
 */
export function exportFileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${slug || "export"}.${extension}`
}
