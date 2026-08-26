"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportFileName } from "@/lib/csv"

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
  schoolName: string
  schoolCode?: string
  fields: DocumentField[]
  table: { caption: string; columns: string[]; rows: string[][] }
  totals: DocumentField[]
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

      pdf.setFontSize(15)
      pdf.text(doc.schoolName, marginX, 18)
      if (doc.schoolCode) {
        pdf.setFontSize(10)
        pdf.setTextColor(110)
        pdf.text(doc.schoolCode, marginX, 24)
        pdf.setTextColor(0)
      }

      pdf.setFontSize(13)
      pdf.text(doc.title, pageWidth - marginX, 18, { align: "right" })
      pdf.setFontSize(10)
      pdf.setTextColor(110)
      pdf.text(doc.reference, pageWidth - marginX, 24, { align: "right" })
      pdf.setTextColor(0)

      pdf.setDrawColor(200)
      pdf.line(marginX, 29, pageWidth - marginX, 29)

      // Detail pairs in two columns, so a six-field receipt stays on three lines.
      pdf.setFontSize(9)
      let cursorY = 37
      doc.fields.forEach((field, index) => {
        const isRightColumn = index % 2 === 1
        const x = isRightColumn ? pageWidth / 2 : marginX
        pdf.setTextColor(110)
        pdf.text(field.label, x, cursorY)
        pdf.setTextColor(0)
        pdf.text(field.value, x, cursorY + 5)
        if (isRightColumn) cursorY += 13
      })
      if (doc.fields.length % 2 === 1) cursorY += 13

      autoTable(pdf, {
        head: [doc.table.columns],
        body: doc.table.rows,
        startY: cursorY,
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59] },
      })

      // jspdf-autotable records where it stopped on the document; fall back if the plugin
      // ever stops reporting it, rather than writing the totals over the table.
      const afterTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      let totalsY = (afterTable?.finalY ?? cursorY) + 12

      pdf.setFontSize(10)
      for (const total of doc.totals) {
        pdf.setTextColor(110)
        pdf.text(total.label, pageWidth - marginX - 60, totalsY, { align: "right" })
        pdf.setTextColor(0)
        pdf.text(total.value, pageWidth - marginX, totalsY, { align: "right" })
        totalsY += 7
      }

      pdf.save(exportFileName(`${doc.title} ${doc.reference}`, "pdf"))
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
