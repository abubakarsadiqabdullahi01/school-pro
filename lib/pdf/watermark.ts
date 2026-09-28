import type jsPDF from "jspdf"

/**
 * The diagonal watermark every school document carries.
 *
 * Two jobs, and the second one matters more than the first. A faint school mark says the
 * paper came from this school; a status stamp says the paper must not be taken at face
 * value — an unconfirmed payment, a refund, a draft. When there is something to warn about,
 * it wins, because "REFUNDED" is worth more to the reader than branding.
 *
 * Drawn on **every** page. The receipt did it once, after the table, which meant the last
 * page carried the mark and page one did not — the page most likely to be photographed and
 * sent on.
 */

export type PageStamp = {
  /** Read at a glance from across a desk, so short. */
  watermark?: string | null
  footerLeft?: string | null
  footerRight?: string | null
  marginX?: number
}

type GStateCapable = {
  GState?: new (options: { opacity: number }) => unknown
  setGState?: (state: unknown) => void
}

/** Runs `draw` with reduced opacity where the renderer supports it. */
function faded(pdf: jsPDF, opacity: number, draw: (supported: boolean) => void) {
  const stamp = pdf as unknown as GStateCapable
  const supported = typeof stamp.GState === "function" && typeof stamp.setGState === "function"

  if (supported && stamp.GState && stamp.setGState) {
    stamp.setGState(new stamp.GState({ opacity }))
  }

  draw(supported)

  if (supported && stamp.GState && stamp.setGState) {
    stamp.setGState(new stamp.GState({ opacity: 1 }))
  }
}

/**
 * Stamps the watermark and footer onto every page of a finished document.
 *
 * Call it last: jsPDF paints in order and there is no z-index, so anything drawn afterwards
 * would sit on top of the mark.
 */
export function stampAllPages(pdf: jsPDF, { watermark, footerLeft, footerRight, marginX = 14 }: PageStamp) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const pages = pdf.getNumberOfPages()

  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page)

    if (footerLeft || footerRight || pages > 1) {
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(7.5)
      pdf.setTextColor(140)
      if (footerLeft) pdf.text(footerLeft, marginX, pageHeight - 10)
      if (footerRight) {
        pdf.text(footerRight, pageWidth - marginX, pageHeight - 10, { align: "right" })
      }
      // Only when there is more than one, so a single-page receipt is not labelled "1 of 1".
      if (pages > 1) {
        pdf.text(`Page ${page} of ${pages}`, pageWidth / 2, pageHeight - 10, { align: "center" })
      }
      pdf.setTextColor(0)
    }

    if (!watermark) continue

    faded(pdf, 0.16, (supported) => {
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(46)
      // Without graphics-state support the only way to stay faint is a pale colour, so the
      // fallback is grey rather than the red a stamp would otherwise be.
      pdf.setTextColor(supported ? 200 : 232, supported ? 60 : 200, supported ? 60 : 200)
      pdf.text(watermark.toUpperCase(), pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: 32,
      })
    })

    pdf.setTextColor(0)
    pdf.setFont("helvetica", "normal")
  }

  // Leave the cursor on the last page, where callers expect it.
  pdf.setPage(pages)
}
