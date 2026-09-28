import { getAccumulatedFundReport, getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { PeriodFilterBar } from "@/components/reports/period-filter-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  countPeriodFilters,
  describePeriodFilters,
  parsePeriodFilters,
  reconcilePeriodFilters,
} from "@/lib/period-filters"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

// The seven columns total 100%, so the printed table fills the page rather than stopping
// short of the right margin. Only the term column wraps — it carries the term over its session.
const columns: DataTableColumn[] = [
  { label: "Term", width: "18%" },
  { label: "Scheduled", align: "right", width: "14%" },
  { label: "Discounts", align: "right", width: "12%" },
  { label: "Exemptions", align: "right", width: "12%" },
  { label: "Net Expected", align: "right", width: "15%" },
  { label: "Paid", align: "right", width: "14%" },
  { label: "Outstanding", align: "right", width: "15%" },
]

/**
 * The income side of the school's year, term by term.
 *
 * Scheduled fees less what was discounted or exempted is what the school can actually expect
 * to collect, and that figure is what the later budget and expenditure report is set
 * against. The totals row is the point of the report, so it stays on every printed page.
 */
export async function AccumulatedFundView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/accumulated-fund`

  // Setup is read first because it settles the filters: a term id from a bookmark may belong
  // to a school year this school no longer has, and the query should not be built on it.
  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const filters = reconcilePeriodFilters(parsePeriodFilters(searchParams), terms)

  const report = await getAccumulatedFundReport({
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
  })
  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const search = filters.search?.toLowerCase()
  const rows = search
    ? report.data.terms.filter((row) => `${row.termName} ${row.sessionName}`.toLowerCase().includes(search))
    : report.data.terms

  const scope = describePeriodFilters(filters, { sessions, terms })
  const filtered = countPeriodFilters(filters) > 0
  const totals = report.data.sessionTotals
  const collected = Number(totals.netExpected) === 0
    ? 0
    : Math.round((Number(totals.paid) / Number(totals.netExpected)) * 1000) / 10

  // The session totals go in as a final row. This report is read as a whole — the point of
  // it is the bottom line that expenditure will later be set against.
  const exportTable: ExportTable = {
    columns: ["Term", "Session", "Scheduled", "Discounts", "Exemptions", "Net Expected", "Paid", "Outstanding"],
    rows: [
      ...rows.map((row) => [
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
        "TOTAL",
        scope,
        formatNairaPlain(totals.scheduledFees),
        formatNairaPlain(totals.discounts),
        formatNairaPlain(totals.exemptions),
        formatNairaPlain(totals.netExpected),
        formatNairaPlain(totals.paid),
        formatNairaPlain(totals.outstanding),
      ],
    ],
    csvRows: [
      ...rows.map((row) => [
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
        "TOTAL",
        scope,
        toCsvAmount(totals.scheduledFees),
        toCsvAmount(totals.discounts),
        toCsvAmount(totals.exemptions),
        toCsvAmount(totals.netExpected),
        toCsvAmount(totals.paid),
        toCsvAmount(totals.outstanding),
      ],
    ],
  }

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.termId,
    search: `${row.termName} ${row.sessionName}`,
    cells: [
      <div key="term" className="min-w-0">
        <div className="font-medium">{row.termName}</div>
        <div className="text-xs text-muted-foreground">{row.sessionName}</div>
      </div>,
      <span key="scheduled" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.scheduledFees)}
      </span>,
      <span key="discounts" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.discounts)}
      </span>,
      <span key="exemptions" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.exemptions)}
      </span>,
      <span key="net" className="whitespace-nowrap font-medium tabular-nums">
        {formatNaira(row.netExpected)}
      </span>,
      <span key="paid" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.paid)}
      </span>,
      <span key="outstanding" className="whitespace-nowrap font-medium tabular-nums">
        {formatNaira(row.outstanding)}
      </span>,
    ],
  }))

  const footerCells = [
    // Named for what is on screen: "SESSION TOTAL" was a fixed label on a table that can be
    // filtered down to one term or widened to every session.
    <span key="label" className="font-semibold">
      {filtered ? "FILTERED TOTAL" : "TOTAL"}
    </span>,
    <span key="scheduled" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.scheduledFees)}
    </span>,
    <span key="discounts" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.discounts)}
    </span>,
    <span key="exemptions" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.exemptions)}
    </span>,
    <span key="net" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.netExpected)}
    </span>,
    <span key="paid" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.paid)}
    </span>,
    <span key="outstanding" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.outstanding)}
    </span>,
  ]

  return (
    // `data-print-landscape` is deliberately absent: the named page it switches on is barely
    // supported and cost a blank first sheet on the receipt register without rotating
    // anything. The columns above are sized to fit portrait instead.
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Accumulated Fund" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Accumulated Fund</h1>
            <InfoGuide guideKey="finance.accumulatedFund" />
          </div>
          <p className="text-muted-foreground">
            Term and session income before expenditure is set against it — scheduled fees, what was given
            away, and what has actually come in.
          </p>
        </div>
        <BrandedReportExport
          title={`Accumulated Fund · ${scope}`}
          subtitle={scope}
          table={exportTable}
          orientation="landscape"
        />
      </div>

      {setup.success && (
        <PeriodFilterBar
          basePath={listPath}
          filters={filters}
          sessions={sessions}
          terms={terms}
          searchPlaceholder="Search by term or session"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Scheduled</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(totals.scheduledFees, { kobo: false })}</p>
          <p className="text-xs text-muted-foreground">before discounts and exemptions</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Net expected</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(totals.netExpected, { kobo: false })}</p>
          <p className="text-xs text-muted-foreground">
            less {formatNaira(Number(totals.discounts) + Number(totals.exemptions), { kobo: false })} given away
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(totals.paid, { kobo: false })}</p>
          <p className="text-xs text-muted-foreground">{collected}% of what is expected</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(totals.outstanding, { kobo: false })}</p>
          <p className="text-xs text-muted-foreground">still to collect</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Income Foundation</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "term" : "terms"} · {formatNaira(totals.paid)} of{" "}
            {formatNaira(totals.netExpected)} collected
            {filtered ? ` · ${scope}` : " · all sessions and terms"}
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="terms"
            searchable={false}
            emptyMessage={
              filtered
                ? "No term matches these filters. Remove one of the chips above, or clear them all."
                : "No charge has been raised yet."
            }
            footer={footerCells}
          />
        </CardContent>
      </Card>
    </div>
  )
}
