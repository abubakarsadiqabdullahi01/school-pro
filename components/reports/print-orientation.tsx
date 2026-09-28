"use client"

import { useEffect } from "react"

/**
 * Prints the route that renders this on a landscape sheet, and nothing else.
 *
 * The app already had a landscape switch — `data-print-landscape`, which pointed the element
 * at a named `@page finance-landscape` rule in globals.css. Named pages are barely supported:
 * Chrome took the page size for layout and still printed portrait, so the right third of
 * every wide report was cut off and the leftover height came out as a blank final sheet.
 *
 * A plain, unnamed `@page` is supported everywhere, but it applies to the whole document —
 * so it cannot live in the global stylesheet, and it turns out it cannot live in the markup
 * either. Two attempts failed for the same reason, that a rule which is rendered is a rule
 * that outlives its view:
 *
 *  - `href` + `precedence` hoists the style into the head, where React leaves it for good.
 *  - A plain `<style>` in the view is also copied into React's streaming template, and that
 *    `<div hidden>` survives a client-side navigation. CSS inside a hidden element still
 *    applies, so one visit to the transaction list made every page printed afterwards
 *    landscape — payment vouchers and receipts included.
 *
 * So the rule is attached to the head on mount and taken off again on unmount, the only
 * arrangement where leaving the screen actually revokes it. It renders nothing, so there is
 * no server-rendered copy to be left behind. `!important` covers the cascade: globals.css
 * carries `@page { size: A4 }`, and the order of the two is not worth depending on.
 */
export function PrintLandscape({ margin = "12mm" }: { margin?: string }) {
  useEffect(() => {
    const style = document.createElement("style")
    style.dataset.printOrientation = "landscape"
    style.textContent = `@media print { @page { size: A4 landscape !important; margin: ${margin} !important; } }`
    document.head.append(style)

    return () => style.remove()
  }, [margin])

  return null
}
