/**
 * The search and paging arithmetic behind the report tables.
 *
 * Kept out of the component so it can be tested in the node environment the rest of the
 * suite uses — there is no DOM test setup in this project, and the parts worth testing here
 * (how a multi-word search matches, what happens to the page number when the rows shrink
 * underneath it) are plain functions anyway.
 */

/** The least a row must expose to be searched and paged. */
export type SearchableRow = { search: string }

/**
 * Rows matching every word in the query, in any order and any column.
 *
 * Word-wise rather than substring: somebody looking for a JSS 2 tuition line types what they
 * remember — "jss 2 tuition" — and should not have to know that the class and the fee name
 * sit in different columns, in the other order.
 */
export function filterRows<T extends SearchableRow>(rows: T[], query: string): T[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return rows

  const words = trimmed.split(/\s+/)
  return rows.filter((row) => {
    const haystack = row.search.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export type PageWindow = {
  /** The page actually shown, clamped into range. */
  page: number
  totalPages: number
  /** Index of the first row on the page; 0 when there are no rows. */
  firstIndex: number
  /** Index one past the last row on the page. */
  lastIndex: number
}

/**
 * Where the current page starts and ends.
 *
 * The requested page is clamped rather than reset: filtering a list down while sitting on
 * page 4 should land on the last page that still exists, not throw the reader back to the
 * first one.
 */
export function pageWindow(totalRows: number, requestedPage: number, pageSize: number): PageWindow {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const firstIndex = (page - 1) * pageSize
  return {
    page,
    totalPages,
    firstIndex: totalRows === 0 ? 0 : firstIndex,
    lastIndex: Math.min(firstIndex + pageSize, totalRows),
  }
}

/** Whether a row at `index` belongs on the current page. */
export function isOnPage(index: number, window: PageWindow): boolean {
  return index >= window.firstIndex && index < window.lastIndex
}
