import type jsPDF from "jspdf"

/**
 * The school letterhead, drawn into a jsPDF document.
 *
 * Deliberately the same shape the compiler's report card uses — logo at the left margin,
 * school name centred and uppercased, address beneath it, a telephone and email line, then
 * the document title and a rule. A receipt, a payment voucher and a payslip should all look
 * like they came from the same school as the report card, because they did.
 *
 * Returns the Y coordinate to carry on from, so callers never guess at spacing.
 */

export type PdfSchool = {
  name: string
  code?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  logoUrl?: string | null
}

/** Matches the report card's masthead proportions. */
const LOGO_SIZE = { width: 22, height: 22 }

/**
 * Fetches a logo as a data URI, which is the only form jsPDF accepts.
 *
 * Goes through /api/convert-image because the logo lives in object storage on another
 * origin, and a browser fetch of it would be blocked by CORS. Any failure returns null: a
 * missing logo must never stop a receipt from printing.
 */
async function logoDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url

  try {
    const response = await fetch("/api/convert-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    })
    if (!response.ok) return null

    const data = await response.json()
    return data?.success && typeof data.dataURL === "string" ? data.dataURL : null
  } catch (error) {
    console.warn("Could not load the school logo for the PDF", error)
    return null
  }
}

export async function drawSchoolHeader(
  pdf: jsPDF,
  {
    school,
    title,
    reference,
    startY = 14,
    marginX = 14,
  }: {
    school: PdfSchool | null
    /** The document's own name: "Receipt", "Payment Voucher", "Payslip". */
    title: string
    /** Shown right-aligned against the title, e.g. a receipt number. */
    reference?: string
    startY?: number
    marginX?: number
  },
): Promise<number> {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const centre = pageWidth / 2
  let y = startY

  if (!school) {
    // No branding resolved — still print a titled document rather than nothing.
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(14)
    pdf.setTextColor(0)
    pdf.text(title.toUpperCase(), centre, y + 4, { align: "center" })
    if (reference) {
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(10)
      pdf.setTextColor(110)
      pdf.text(reference, centre, y + 10, { align: "center" })
      pdf.setTextColor(0)
    }
    pdf.setDrawColor(200)
    pdf.line(marginX, y + 14, pageWidth - marginX, y + 14)
    return y + 20
  }

  if (school.logoUrl) {
    const dataUrl = await logoDataUrl(school.logoUrl)
    if (dataUrl) {
      try {
        pdf.addImage(
          dataUrl,
          dataUrl.includes("image/png") ? "PNG" : "JPEG",
          marginX,
          y,
          LOGO_SIZE.width,
          LOGO_SIZE.height,
        )
      } catch (error) {
        // A logo that jsPDF cannot decode is not worth failing a receipt over.
        console.warn("Could not place the school logo in the PDF", error)
      }
    }
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(14)
  pdf.setTextColor(30, 41, 59)
  pdf.text(school.name.toUpperCase(), centre, y + 6, { align: "center" })

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  pdf.setTextColor(90)
  if (school.address) {
    pdf.text(school.address, centre, y + 11, { align: "center", maxWidth: pageWidth - marginX * 2 - LOGO_SIZE.width })
  }

  const contact = [school.phone ? `Tel: ${school.phone}` : null, school.email ? `Email: ${school.email}` : null]
    .filter(Boolean)
    .join("  |  ")
  if (contact) {
    pdf.text(contact, centre, y + 15, { align: "center" })
  }

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  pdf.setTextColor(30, 41, 59)
  pdf.text(title.toUpperCase(), centre, y + 22, { align: "center" })

  if (reference) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(110)
    pdf.text(reference, centre, y + 27, { align: "center" })
    y += 3
  }

  pdf.setDrawColor(180)
  pdf.setLineWidth(0.4)
  pdf.line(marginX, y + 29, pageWidth - marginX, y + 29)

  pdf.setTextColor(0)
  return y + 35
}
