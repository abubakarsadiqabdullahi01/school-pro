"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, Printer, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportFileName, toCsv } from "@/lib/csv"
import { drawSchoolHeader, type PdfSchool } from "@/lib/pdf/school-header"
import { sharePdf } from "@/lib/pdf/share-pdf"

/**
 * Print, PDF and CSV for a tabular report.
 *
 * Cells arrive as finished strings. The server view formats them — money through the
 * Decimal helpers, dates in the school's locale — so this component never imports
 * `@prisma/client` and the download bundle stays small.
 *
 * PDF and CSV carry different money: `pdf` reads `NGN 50,000.00`, `csv` carries a bare
 * `50000.00` so a spreadsheet treats the column as numbers. Where they differ, the view
 * supplies both.
 */
export type ExportTable = {
  columns: string[]
  /** Display rows, used for the PDF. */
  rows: string[][]
  /** Machine-readable rows for the spreadsheet. Defaults to `rows` when not supplied. */
  csvRows?: string[][]
}

export function ReportExport({
  title,
  subtitle,
  table,
  school,
  orientation = "landscape",
}: {
  title: string
  subtitle?: string
  table: ExportTable
  /** The letterhead. Omitted, the PDF still prints with a plain title. */
  school?: PdfSchool | null
  orientation?: "portrait" | "landscape"
}) {
  const [isBuilding, setIsBuilding] = useState(false)
  const isEmpty = table.rows.length === 0

  function downloadCsv() {
    const csv = toCsv(table.columns, table.csvRows ?? table.rows)
    // The BOM is what makes Excel read the file as UTF-8; without it a student name with
    // an accent arrives mangled.
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = exportFileName(title, "csv")
    link.click()
    URL.revokeObjectURL(url)
  }

  async function downloadPdf(mode: "save" | "share" = "save") {
    setIsBuilding(true)
    try {
      // Loaded on click. jsPDF and its autotable plugin are large, and a report page that
      // is mostly read and rarely exported should not pay for them up front.
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ])

      const doc = new jsPDF({ orientation })

      doc.setProperties({ title, subject: subtitle ?? title, author: school?.name ?? "DigiSchool-Pro" })

      // The same letterhead a receipt or a payslip gets, so an exported report is
      // recognisably from the school rather than an anonymous table.
      const headerBottom = await drawSchoolHeader(doc, {
        school: school ?? null,
        title,
        reference: subtitle,
      })

      autoTable(doc, {
        head: [table.columns],
        body: table.rows,
        startY: headerBottom,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59] },
      })

      if (mode === "share") await sharePdf(doc.output("blob"), exportFileName(title, "pdf"), title)
      else doc.save(exportFileName(title, "pdf"))
    } catch (error) {
      console.error("Failed to build finance PDF", error)
      toast.error("Could not build the PDF", {
        description: error instanceof Error ? error.message : "Try the CSV export instead.",
      })
    } finally {
      setIsBuilding(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadPdf()} disabled={isEmpty || isBuilding}>
        <Download className="mr-2 h-4 w-4" />
        {isBuilding ? "Building…" : "PDF"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={downloadCsv} disabled={isEmpty}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadPdf("share")} disabled={isEmpty || isBuilding}>
        <Share2 className="mr-2 h-4 w-4" />
        Share
      </Button>
    </div>
  )
}
