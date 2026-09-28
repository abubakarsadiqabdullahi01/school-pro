"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportFileName } from "@/lib/csv"
import { drawSchoolHeader, type PdfSchool } from "@/lib/pdf/school-header"
import { stampAllPages } from "@/lib/pdf/watermark"

/**
 * A one-off financial document — a receipt, a statement, an expenditure voucher — as a PDF.
 *
 * Printing already offers "Save as PDF", but a receipt handed to a parent should not depend
 * on the cashier picking the right printer destination, and a statement emailed to a parent
 * needs a file. Both documents share a shape: a school header, labelled detail pairs, a
 * table of lines, and a short set of totals.
 *
 * Values arrive formatted from the server, money included — jsPDF's built-in fonts cannot
 * print ₦, so the views pass NGN-prefixed strings.
 */
export type DocumentField = { label: string; value: string }

export type PrintableDocument = {
  /** Heading on the page, e.g. "Receipt". */
  title: string
  /** Used for the filename, e.g. a receipt number or student name. */
  reference: string
  /** Optional explicit filename stem when the document needs a stricter naming standard. */
  fileName?: string
  schoolName: string
  schoolCode?: string
  /**
   * The full letterhead: logo, address and contact line. When present the document gets the
   * same masthead as the compiler's report card. `schoolName` alone still works, so an older
   * caller degrades to a plain title rather than breaking.
   */
  school?: PdfSchool | null
  fields: DocumentField[]
  table: { caption: string; columns: string[]; rows: string[][] }
  totals: DocumentField[]
  /**
   * A caveat printed above the detail, for a document that is not what its title implies —
   * a receipt for a payment that has not cleared, say. Omitted when there is nothing to say.
   */
  notice?: string | null
  /**
   * Stamped diagonally across the page for a document that must not be mistaken for a
   * settled one — an unconfirmed payment, a refund, a draft. Kept short: it is read at a
   * glance, from across a desk.
   */
  watermark?: string | null
  /** Compact a short-form document such as a receipt to one A4 sheet. */
  fitOnePage?: boolean
  signatureLabel?: string
  /**
   * Signature blocks along the foot of the document.
   *
   * A block with a `name` is an electronic signature: the person who produced the document
   * is printed above the rule with a note that no ink is required. A block without one is
   * a space for somebody to sign by hand on their copy. `signatureLabel` remains for
   * callers that only need the single unsigned rule.
   */
  signatures?: Array<{ label: string; name?: string | null; caption?: string }>
}

export function DocumentDownload({ document: doc, label }: { document: PrintableDocument; label: string }) {
  const [isBuilding, setIsBuilding] = useState(false)

  async function download() {
    setIsBuilding(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])

      const pdf = new jsPDF()
      const pageWidth = pdf.internal.pageSize.getWidth()
      const marginX = 14

      pdf.setProperties({
        title: `${doc.title} - ${doc.reference}`,
        subject: doc.title,
        author: doc.schoolName,
      })

      // One letterhead for every printed document in the system, matching the report card.
      const headerBottom = await drawSchoolHeader(pdf, {
        school: doc.school ?? { name: doc.schoolName, code: doc.schoolCode },
        title: doc.title,
        reference: doc.reference,
        marginX,
      })

      let cursorY = headerBottom

      // The caveat goes first, before the figures it qualifies — a reader who stops after
      // the amount should have met it already.
      if (doc.notice) {
        pdf.setFontSize(9)
        const noticeLines = pdf.splitTextToSize(doc.notice, pageWidth - marginX * 2 - 6)
        const noticeHeight = noticeLines.length * 4.5 + 6
        pdf.setFillColor(254, 243, 199)
        pdf.setDrawColor(217, 119, 6)
        pdf.setLineWidth(0.4)
        pdf.rect(marginX, cursorY - 4, pageWidth - marginX * 2, noticeHeight, "FD")
        pdf.setTextColor(120, 53, 15)
        pdf.text(noticeLines, marginX + 3, cursorY + 2)
        pdf.setTextColor(0)
        cursorY += noticeHeight + 6
      }

      // Detail pairs in two columns, so a six-field receipt stays on three lines.
      pdf.setFontSize(doc.fitOnePage ? 8 : 9)
      const fieldStep = doc.fitOnePage ? 11 : 13
      doc.fields.forEach((field, index) => {
        const isRightColumn = index % 2 === 1
        const x = isRightColumn ? pageWidth / 2 : marginX
        pdf.setTextColor(110)
        pdf.text(field.label, x, cursorY)
        pdf.setTextColor(0)
        pdf.text(field.value, x, cursorY + 5)
        if (isRightColumn) cursorY += fieldStep
      })
      if (doc.fields.length % 2 === 1) cursorY += fieldStep

      const compactTable = doc.fitOnePage && doc.table.rows.length > 8
      const veryCompactTable = doc.fitOnePage && doc.table.rows.length > 16

      autoTable(pdf, {
        head: [doc.table.columns],
        body: doc.table.rows,
        startY: cursorY,
        styles: {
          fontSize: veryCompactTable ? 6 : compactTable ? 7 : doc.fitOnePage ? 8 : 9,
          cellPadding: veryCompactTable ? 1 : compactTable ? 1.5 : doc.fitOnePage ? 2 : 2.5,
        },
        headStyles: { fillColor: [30, 41, 59] },
        rowPageBreak: "avoid",
      })

      // jspdf-autotable records where it stopped on the document; fall back if the plugin
      // ever stops reporting it, rather than writing the totals over the table.
      const afterTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      let totalsY = (afterTable?.finalY ?? cursorY) + (doc.fitOnePage ? 8 : 12)

      pdf.setFontSize(10)
      for (const total of doc.totals) {
        pdf.setTextColor(110)
        pdf.text(total.label, pageWidth - marginX - 60, totalsY, { align: "right" })
        pdf.setTextColor(0)
        pdf.text(total.value, pageWidth - marginX, totalsY, { align: "right" })
        totalsY += 7
      }

      const blocks =
        doc.signatures ?? (doc.signatureLabel ? [{ label: doc.signatureLabel }] : [])

      if (blocks.length > 0) {
        const signatureY = doc.fitOnePage
          ? Math.min(Math.max(totalsY + 12, 245), 268)
          : Math.max(totalsY + 18, 245)
        const columnWidth = (pageWidth - marginX * 2) / blocks.length
        const ruleWidth = Math.min(columnWidth - 8, 70)

        blocks.forEach((block, index) => {
          const x = marginX + index * columnWidth

          // The signer's name sits on the rule, where a written signature would go.
          if (block.name) {
            pdf.setFont("helvetica", "italic")
            pdf.setFontSize(11)
            pdf.setTextColor(40)
            pdf.text(block.name, x, signatureY - 2)
            pdf.setFont("helvetica", "normal")
          }

          pdf.setDrawColor(160)
          pdf.setLineWidth(0.3)
          pdf.line(x, signatureY, x + ruleWidth, signatureY)

          pdf.setFontSize(9)
          pdf.setTextColor(60)
          pdf.text(block.label, x, signatureY + 5)

          if (block.caption) {
            pdf.setFontSize(7.5)
            pdf.setTextColor(130)
            const lines = pdf.splitTextToSize(block.caption, ruleWidth)
            pdf.text(lines, x, signatureY + 9)
          }

          pdf.setTextColor(0)
        })
      }

      // Every page, not just the last. This used to run once after the table, so a
      // two-page receipt carried the mark and the print date on page two only — and page
      // one is the page that gets photographed and sent on.
      stampAllPages(pdf, {
        // A document that has something to warn about says so; everything else carries the
        // school's own code. Applied here rather than per caller so a voucher, a statement
        // and a payslip are marked without each one remembering to ask.
        watermark: doc.watermark ?? doc.school?.code ?? doc.schoolCode ?? null,
        footerLeft: `Printed ${new Date().toLocaleString()}`,
        footerRight: doc.schoolName,
        marginX,
      })

      pdf.save(exportFileName(doc.fileName ?? `${doc.title} ${doc.reference}`, "pdf"))
    } catch (error) {
      console.error("Failed to build finance document PDF", error)
      toast.error("Could not build the PDF", {
        description: error instanceof Error ? error.message : "Use Print and save as PDF instead.",
      })
    } finally {
      setIsBuilding(false)
    }
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={isBuilding}>
      <Download className="mr-2 h-4 w-4" />
      {isBuilding ? "Building…" : label}
    </Button>
  )
}
