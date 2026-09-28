import { getExpenditureSetupData, getSessionExpenditureReport } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { SpendBarChart } from "@/components/reports/spend-bar-chart"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PeriodFilterBar } from "@/components/reports/period-filter-bar"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"
import { parsePeriodFilters } from "@/lib/period-filters"

// Five columns totalling 100%, which fit a portrait sheet. Only the transaction list and the
// payment chart are wide enough to need landscape.
const termColumns: DataTableColumn[] = [
  { label: "Term", width: "24%" },
  { label: "Paid", align: "right", width: "20%" },
  { label: "Committed", align: "right", width: "20%" },
  { label: "Awaiting Approval", align: "right", width: "22%" },
  { label: "Transactions", align: "right", width: "14%" },
]

const breakdownColumns: DataTableColumn[] = [
  { label: "Name", width: "52%" },
  { label: "Paid", align: "right", width: "30%" },
  { label: "Count", align: "right", width: "18%" },
]

/**
 * A whole school year of spending, term by term.
 *
 * The session used to be chosen from a row of buttons, which grew by one every year and said
 * nothing about which was current. It is the shared period bar now — no term select, because
 * the terms are the rows of the report rather than a filter on it — and the state lives in
 * the URL, so a year's figures are a link somebody can be sent.
 *
 * The chart takes the terms in calendar order rather than by size: what a governor asks of a
 * session is whether spending is climbing, and that is a shape, not a ranking.
 */
export async function SessionExpenditureReportView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/reports/session`
  const filters = parsePeriodFilters(searchParams)

  const [report, setup] = await Promise.all([
    getSessionExpenditureReport({ sessionId: filters.sessionId ?? null }),
    getExpenditureSetupData(),
  ])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const { data } = report
  const scope = data.sessionName ?? "All sessions"
  const totals = data.sessionTotals
  const sessions = setup.success ? setup.data.sessions : []

  // The report always reads over one session — the current one when the URL names none — so
  // the bar is shown the session that was actually used rather than an empty selection.
  const shown = { ...filters, sessionId: filters.sessionId ?? data.sessionId ?? undefined }

  // Applied here rather than in the query: this is one session's worth of rows, and
  // searching what came back keeps a single round trip.
  const search = filters.search?.toLowerCase()
  const matches = (name: string) => !search || name.toLowerCase().includes(search)

  const terms = data.terms.filter((row) => matches(row.termName))
  const categories = data.byCategory.filter((row) => matches(row.name))
  const accounts = data.byAccount.filter((row) => matches(row.name))

  const busiest = data.terms.reduce<(typeof data.terms)[number] | null>(
    (highest, row) => (highest && Number(highest.paid) >= Number(row.paid) ? highest : row),
    null,
  )

  // The session total goes in as a final row: this report is read as a whole, and the bottom
  // line is what the budget summary is set against.
  const exportTable: ExportTable = {
    columns: ["Term", "Paid", "Committed", "Awaiting Approval", "Transactions"],
    rows: [
      ...terms.map((row) => [
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
      ...terms.map((row) => [
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

  // Keyed because these arrays are built on the server and cross into the client payload,
  // where React checks the elements of a list for keys.
  const termRows: DataTableRow[] = terms.map((row) => ({
    id: row.termId,
    search: row.termName,
    cells: [
      <span key="term" className="font-medium">
        {row.termName}
      </span>,
      <span key="paid" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.paid)}
      </span>,
      <span key="committed" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.committed)}
      </span>,
      <span
        key="pending"
        className={`whitespace-nowrap tabular-nums ${Number(row.pending) > 0 ? "text-amber-600 dark:text-amber-500" : ""}`}
      >
        {formatNaira(row.pending)}
      </span>,
      <span key="count" className="tabular-nums">
        {row.count}
      </span>,
    ],
  }))

  const termFooter = [
    <span key="label" className="font-semibold">
      {search ? "FILTERED TOTAL" : "SESSION TOTAL"}
    </span>,
    <span key="paid" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.paid)}
    </span>,
    <span key="committed" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.committed)}
    </span>,
    <span key="pending" className="whitespace-nowrap tabular-nums">
      {formatNaira(totals.pending)}
    </span>,
    <span key="count" className="tabular-nums">
      {totals.count}
    </span>,
  ]

  const breakdownRows = (rows: Array<{ id: string; name: string; amount: string; count: number }>) =>
    rows.map((row) => ({
      id: row.id,
      search: row.name,
      cells: [
        <span key="name" className="font-medium">
          {row.name}
        </span>,
        <span key="paid" className="whitespace-nowrap tabular-nums">
          {formatNaira(row.amount)}
        </span>,
        <span key="count" className="tabular-nums">
          {row.count}
        </span>,
      ],
    }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Session Expenditure" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Session Expenditure</h1>
            <InfoGuide guideKey="expenditure.sessionReport" />
          </div>
          <p className="text-muted-foreground">
            Term by term across the whole session, with the category breakdown. Choose the session above; the
            figures, the chart and every export follow it.
          </p>
        </div>
        <BrandedReportExport title={`Session Expenditure · ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilterBar
          basePath={listPath}
          filters={shown}
          sessions={sessions}
          searchPlaceholder="Search term, category or account"
        />
      )}

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Paid this session</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(totals.paid, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">money actually out</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Committed</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(totals.committed, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">approved, paid or not</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              Number(totals.pending) > 0 ? "text-amber-600 dark:text-amber-500" : ""
            }`}
          >
            {formatNaira(totals.pending, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">not yet authorised</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Heaviest term</p>
          <p className="text-2xl font-bold print:text-[11pt]">{busiest?.termName ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {busiest ? `${formatNaira(busiest.paid, { kobo: false })} paid` : "nothing paid out yet"}
          </p>
        </div>
      </div>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>How the session ran</CardTitle>
          <CardDescription>
            Paid expenditure by term, in calendar order · {scope}. A flat line is payroll; the steps are
            everything else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.terms.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No terms recorded for this session.
            </p>
          ) : (
            <SpendBarChart
              rows={data.terms.map((row) => ({
                name: row.termName,
                amount: row.paid,
                budgetLimit: null,
                overBy: null,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Term by Term</CardTitle>
          <CardDescription>
            {terms.length} {terms.length === 1 ? "term" : "terms"} · {scope}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={termColumns}
            rows={termRows}
            unit="terms"
            searchable={false}
            footer={termFooter}
            emptyMessage={search ? "No term matches that search." : "No terms found for this session."}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
            <CardDescription>
              {categories.length} {categories.length === 1 ? "category" : "categories"} across the whole
              session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={breakdownColumns}
              rows={breakdownRows(categories)}
              pageSize={8}
              unit="categories"
              searchable={false}
              emptyMessage={
                search ? "No category matches that search." : "Nothing paid out this session."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Account</CardTitle>
            <CardDescription>Which account each naira left from.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={breakdownColumns}
              rows={breakdownRows(accounts)}
              pageSize={8}
              unit="accounts"
              searchable={false}
              emptyMessage={search ? "No account matches that search." : "Nothing paid out this session."}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
