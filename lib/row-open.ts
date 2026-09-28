import type { MouseEvent } from "react"

/**
 * Click-to-open for a table row.
 *
 * A row that only opens through its three-dot menu makes people hunt for a menu to do the
 * most ordinary thing in the table. Clicking the row itself is what everyone tries first.
 *
 * Two things this guards against, which is why it is a helper rather than a bare `onClick`:
 *
 *  - Selecting text. Highlighting a term name to copy it ends in a click, and without the
 *    guard that click navigates away and takes the selection with it.
 *  - The row actions. The cell holding the menu stops propagation itself, so opening the
 *    menu never also opens the row.
 */
export function rowOpenHandler(open: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    // A modified click means "open elsewhere" to most people; leave it to the browser
    // rather than swallowing it and navigating this tab.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    open()
  }
}
