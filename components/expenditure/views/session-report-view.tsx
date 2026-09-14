import { getExpenditureSetupData, getSessionExpenditureReport } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PeriodFilter } from "@/components/reports/period-filter"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function SessionExpenditureReportView({
  basePath,
  sessionId,
}: {
  basePath: string
  sessionId?: string
}) {
  const [report, setup] = await Promise.all([getSessionExpenditureReport({ sessionId }), getExpenditureSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const { data } = report
  const scope = data.sessionName ?? "All sessions"
  const totals = data.sessionTotals

  // The session total goes in as a final row: this report is read as a whole, and the
  // bottom line is what the budget summary is set against.
  const exportTable: ExportTable = {
    columns: ["Term", "Paid", "Committed", "Awaiting Approval", "Transactions"],
    rows: [
      ...data.terms.map((row) => [
        row.termName,
        formatNairaPlain(row.paid),
        formatNairaPlain(row.committed),
        formatNairaPlain(row.pending),
        String(row.count),
      ]),
      [
        "SESSION TOTAL",
        formatNairaPlain(totals.paid),
        formatNairaPlain(totals.committed),
        formatNairaPlain(totals.pending),
        String(totals.count),
      ],
    ],
    csvRows: [
      ...data.terms.map((row) => [
        row.termName,
        toCsvAmount(row.paid),
        toCsvAmount(row.committed),
        toCsvAmount(row.pending),
        String(row.count),
      ]),
      [
        "SESSION TOTAL",
        toCsvAmount(totals.paid),
        toCsvAmount(totals.committed),
        toCsvAmount(totals.pending),
        String(totals.count),
      ],
    ],
  }

  const termColumns: DataTableColumn[] = [
    { label: "Term" },
    { label: "Paid", align: "right" },
    { label: "Committed", align: "right" },
    { label: "Awaiting Approval", align: "right" },
    { label: "Transactions", align: "right" },
  ]

  const termRows: DataTableRow[] = data.terms.map((row) => ({
    id: row.termId,
    search: row.termName,
    cells: [
      <span className="font-medium">{row.termName}</span>,
      formatNaira(row.paid),
      formatNaira(row.committed),
      formatNaira(row.pending),
      row.count,
    ],
  }))

  const termFooter = [
    "Session total",
    formatNaira(totals.paid),
    formatNaira(totals.committed),
    formatNaira(totals.pending),
    totals.count,
  ]

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Session Expenditure" reference={scope} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Session Expenditure</h1>
          <p className="text-muted-foreground">Term by term across the whole session, with the category breakdown.</p>
        </div>
        <BrandedReportExport title={`Session Expenditure ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilter
          basePath={`${basePath}/reports/session`}
          sessions={setup.data.sessions}
          selectedSessionId={sessionId}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Tile label="Paid this session" value={totals.paid} />
        <Tile label="Committed" value={totals.committed} />
        <Tile label="Awaiting approval" value={totals.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Term by Term</CardTitle>
          <CardDescription>{scope}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={termColumns}
            rows={termRows}
            unit="terms"
            searchPlaceholder="Search by term"
            emptyMessage="No terms found for this session."
            footer={termFooter}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By Category" description="Across the whole session." rows={data.byCategory} />
        <BreakdownTable title="By Account" description="Which account each naira left from." rows={data.byAccount} />
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{formatNaira(value, { kobo: false })}</CardContent>
    </Card>
  )
}

function BreakdownTable({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{ id: string; name: string; amount: string; count: number }>
}) {
  const columns: DataTableColumn[] = [
    { label: "Name" },
    { label: "Paid", align: "right" },
    { label: "Count", align: "right" },
  ]

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    search: row.name,
    cells: [<span className="font-medium">{row.name}</span>, formatNaira(row.amount), row.count],
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={tableRows}
          pageSize={8}
          unit="entries"
          searchPlaceholder="Search by name"
          emptyMessage="Nothing paid out this session."
        />
      </CardContent>
    </Card>
  )
}
