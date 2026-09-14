import { getAccumulatedFundReport, getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import type { ExportTable } from "@/components/reports/report-export"
import { PeriodFilter } from "@/components/reports/period-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function AccumulatedFundView({ basePath, sessionId }: { basePath: string; sessionId?: string }) {
  const [report, setup] = await Promise.all([getAccumulatedFundReport({ sessionId }), getFinanceSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const sessionName = setup.success
    ? setup.data.sessions.find((session) => session.id === sessionId)?.name
    : undefined

  // The session totals go in as a final row. This report is read as a whole — the point of
  // it is the bottom line that expenditure will later be set against.
  const totals = report.data.sessionTotals
  const exportTable: ExportTable = {
    columns: ["Term", "Session", "Scheduled", "Discounts", "Exemptions", "Net Expected", "Paid", "Outstanding"],
    rows: [
      ...report.data.terms.map((row) => [
        row.termName,
        row.sessionName,
        formatNairaPlain(row.scheduledFees),
        formatNairaPlain(row.discounts),
        formatNairaPlain(row.exemptions),
        formatNairaPlain(row.netExpected),
        formatNairaPlain(row.paid),
        formatNairaPlain(row.outstanding),
      ]),
      [
        "SESSION TOTAL",
        sessionName ?? "",
        formatNairaPlain(totals.scheduledFees),
        formatNairaPlain(totals.discounts),
        formatNairaPlain(totals.exemptions),
        formatNairaPlain(totals.netExpected),
        formatNairaPlain(totals.paid),
        formatNairaPlain(totals.outstanding),
      ],
    ],
    csvRows: [
      ...report.data.terms.map((row) => [
        row.termName,
        row.sessionName,
        toCsvAmount(row.scheduledFees),
        toCsvAmount(row.discounts),
        toCsvAmount(row.exemptions),
        toCsvAmount(row.netExpected),
        toCsvAmount(row.paid),
        toCsvAmount(row.outstanding),
      ]),
      [
        "SESSION TOTAL",
        sessionName ?? "",
        toCsvAmount(totals.scheduledFees),
        toCsvAmount(totals.discounts),
        toCsvAmount(totals.exemptions),
        toCsvAmount(totals.netExpected),
        toCsvAmount(totals.paid),
        toCsvAmount(totals.outstanding),
      ],
    ],
  }

  const columns: DataTableColumn[] = [
    { label: "Term" },
    { label: "Scheduled", align: "right" },
    { label: "Discounts", align: "right" },
    { label: "Exemptions", align: "right" },
    { label: "Net Expected", align: "right" },
    { label: "Paid", align: "right" },
    { label: "Outstanding", align: "right" },
  ]

  const rows: DataTableRow[] = report.data.terms.map((row) => ({
    id: row.termId,
    search: `${row.termName} ${row.sessionName}`,
    cells: [
      <>
        <div className="font-medium">{row.termName}</div>
        <div className="text-muted-foreground">{row.sessionName}</div>
      </>,
      formatNaira(row.scheduledFees),
      formatNaira(row.discounts),
      formatNaira(row.exemptions),
      formatNaira(row.netExpected),
      formatNaira(row.paid),
      formatNaira(row.outstanding),
    ],
  }))

  const footerCells = [
    "SESSION TOTAL",
    formatNaira(totals.scheduledFees),
    formatNaira(totals.discounts),
    formatNaira(totals.exemptions),
    formatNaira(totals.netExpected),
    formatNaira(totals.paid),
    formatNaira(totals.outstanding),
  ]

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Accumulated Fund" reference={sessionName} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Accumulated Fund</h1>
          <p className="text-muted-foreground">
            Term and session income totals before expenditure is introduced into the finance report.
          </p>
        </div>
        <BrandedReportExport
          title={sessionName ? `Accumulated Fund ${sessionName}` : "Accumulated Fund"}
          subtitle={sessionName ? `Session: ${sessionName}` : "All sessions"}
          table={exportTable}
          orientation="landscape"
        />
      </div>
      {setup.success && (
        <PeriodFilter
          basePath={`${basePath}/accumulated-fund`}
          sessions={setup.data.sessions}
          selectedSessionId={sessionId}
        />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Expected</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.netExpected, { kobo: false })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Paid</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.paid, { kobo: false })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.outstanding, { kobo: false })}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Income Foundation</CardTitle>
          <CardDescription>
            This becomes the income side of the later budget and expenditure report. Search by term or session; the
            session total stays on every page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            unit="terms"
            searchPlaceholder="Search by term or session"
            emptyMessage="No charge data found."
            footer={footerCells}
          />
        </CardContent>
      </Card>
    </div>
  )
}
