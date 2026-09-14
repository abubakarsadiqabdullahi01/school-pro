import { getClassPaymentSummary, getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import type { ExportTable } from "@/components/reports/report-export"
import { PeriodFilter } from "@/components/reports/period-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function ClassSummaryView({ basePath, termId }: { basePath: string; termId?: string }) {
  const [summary, setup] = await Promise.all([getClassPaymentSummary({ termId }), getFinanceSetupData()])

  if (!summary.success) {
    return <p className="text-destructive">{summary.error}</p>
  }

  const termName = setup.success ? setup.data.terms.find((term) => term.id === termId)?.name : undefined

  // The status counts are split into their own columns for export: "3 paid · 1 partial"
  // reads fine on screen but cannot be filtered or summed in a spreadsheet.
  const exportTable: ExportTable = {
    columns: ["Class", "Term", "Students", "Expected", "Paid", "Outstanding", "Fully Paid", "Partial", "Unpaid", "Collection %"],
    rows: summary.data.map((row) => [
      row.className,
      row.termName,
      String(row.students),
      formatNairaPlain(row.expected),
      formatNairaPlain(row.paid),
      formatNairaPlain(row.outstanding),
      String(row.paidCount),
      String(row.partialCount),
      String(row.unpaidCount),
      `${row.collectionRate}%`,
    ]),
    csvRows: summary.data.map((row) => [
      row.className,
      row.termName,
      String(row.students),
      toCsvAmount(row.expected),
      toCsvAmount(row.paid),
      toCsvAmount(row.outstanding),
      String(row.paidCount),
      String(row.partialCount),
      String(row.unpaidCount),
      String(row.collectionRate),
    ]),
  }

  const columns: DataTableColumn[] = [
    { label: "Class" },
    { label: "Students", align: "right" },
    { label: "Expected", align: "right" },
    { label: "Paid", align: "right" },
    { label: "Outstanding", align: "right" },
    { label: "Status Count" },
    { label: "Collection", align: "right" },
  ]

  const rows: DataTableRow[] = summary.data.map((row) => ({
    id: row.classTermId,
    search: `${row.className} ${row.termName}`,
    cells: [
      <>
        <div className="font-medium">{row.className}</div>
        <div className="text-muted-foreground">{row.termName}</div>
      </>,
      row.students,
      formatNaira(row.expected),
      formatNaira(row.paid),
      formatNaira(row.outstanding),
      `${row.paidCount} paid · ${row.partialCount} partial · ${row.unpaidCount} unpaid`,
      <span className="font-medium">{row.collectionRate}%</span>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Class Payment Summary" reference={termName} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Class Payment Summary</h1>
          <p className="text-muted-foreground">
            Expected, paid, outstanding, and collection percentage by class for school finance review.
          </p>
        </div>
        <BrandedReportExport
          title={termName ? `Class Payment Summary ${termName}` : "Class Payment Summary"}
          subtitle={termName ? `Term: ${termName}` : "All terms"}
          table={exportTable}
          orientation="landscape"
        />
      </div>
      {setup.success && (
        <PeriodFilter basePath={`${basePath}/class-summary`} terms={setup.data.terms} selectedTermId={termId} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Class Summary</CardTitle>
          <CardDescription>
            Aggregated from fee schedules and student charges. Search by class or term; the printed copy carries every
            matching row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            unit="classes"
            searchPlaceholder="Search by class or term"
            emptyMessage="No class charges found."
          />
        </CardContent>
      </Card>
    </div>
  )
}
