import { getBudgetSummary, getExpenditureSetupData } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PeriodFilterBar } from "@/components/reports/period-filter-bar"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"
import { parsePeriodFilters } from "@/lib/period-filters"

// Three columns totalling 100%, which fit a portrait sheet. The section column is what makes
// the printed reconciliation readable — twelve undifferentiated rows of naira are not.
const lineColumns: DataTableColumn[] = [
  { label: "Section", width: "22%" },
  { label: "Line", width: "48%" },
  { label: "Amount", align: "right", width: "30%" },
]

/**
 * Where the two modules meet.
 *
 * Three balances, because they answer three different questions, and a school that reads
 * only one of them will get a nasty surprise:
 *
 *  - **Actual** is cash reality: collected, less paid out.
 *  - **Committed** subtracts approved-but-unpaid expenditure too. This is the one to check
 *    before promising more money, because that spending is already spoken for.
 *  - **Expected** assumes every debtor eventually pays. It is what a budget is planned
 *    against, and the most optimistic of the three.
 *
 * The session used to be picked from a row of buttons that grew by one every year and said
 * nothing about which was current. It is the shared period bar now — no term select, because
 * a budget is reconciled over a whole school year — and the state lives in the URL, so a
 * year's reconciliation is a link somebody can be sent.
 *
 * Deliberately no chart. Every other expenditure screen earns one, but the figures here are
 * income and outflow mixed with three signed balances: bars of that, side by side, invite
 * exactly the misreading the three separate balances exist to prevent.
 */
export async function BudgetSummaryView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/budget-summary`
  const filters = parsePeriodFilters(searchParams)

  const [summary, setup] = await Promise.all([
    getBudgetSummary({ sessionId: filters.sessionId ?? null }),
    getExpenditureSetupData(),
  ])

  if (!summary.success) {
    return <p className="text-destructive">{summary.error}</p>
  }

  const { data } = summary
  const scope = data.sessionName ?? "All sessions"
  const sessions = setup.success ? setup.data.sessions : []

  // The reconciliation always reads over one session — the current one when the URL names
  // none — so the bar is shown the session that was actually used, not an empty selection.
  const shown = { ...filters, sessionId: filters.sessionId ?? data.sessionId ?? undefined }

  const lines: Array<{ section: string; label: string; value: string; emphasis?: boolean }> = [
    { section: "Income", label: "Scheduled school fees", value: data.income.scheduledFees },
    { section: "Income", label: "Less discounts", value: data.income.discounts },
    { section: "Income", label: "Less exemptions", value: data.income.exemptions },
    { section: "Income", label: "Net expected income", value: data.income.netExpected, emphasis: true },
    { section: "Income", label: "Fees actually collected", value: data.income.paid, emphasis: true },
    { section: "Income", label: "Outstanding debt", value: data.income.outstanding },
    { section: "Expenditure", label: "Expenditure paid", value: data.expenditure.paid, emphasis: true },
    { section: "Expenditure", label: "Approved, not yet paid", value: data.expenditure.approvedUnpaid },
    { section: "Expenditure", label: "Awaiting approval", value: data.expenditure.pending },
    { section: "Balance", label: "Balance forward (actual)", value: data.actualBalance, emphasis: true },
    { section: "Balance", label: "Balance after commitments", value: data.committedBalance, emphasis: true },
    { section: "Balance", label: "Balance if all debt is paid", value: data.expectedBalance, emphasis: true },
  ]

  // Applied here rather than in the query: the reconciliation is twelve rows the server has
  // already computed, and searching them keeps a single round trip.
  const search = filters.search?.toLowerCase()
  const rows = search
    ? lines.filter((line) => `${line.section} ${line.label}`.toLowerCase().includes(search))
    : lines

  const exportTable: ExportTable = {
    columns: ["Section", "Line", "Amount"],
    rows: rows.map((line) => [line.section, line.label, formatNairaPlain(line.value)]),
    csvRows: rows.map((line) => [line.section, line.label, toCsvAmount(line.value)]),
  }

  // Keyed because this array is built on the server and crosses into the client payload,
  // where React checks the elements of a list for keys.
  const tableRows: DataTableRow[] = rows.map((line) => ({
    id: line.label,
    search: `${line.section} ${line.label}`,
    cells: [
      <span key="section" className="text-xs text-muted-foreground">
        {line.section}
      </span>,
      <span key="line" className={line.emphasis ? "font-semibold" : ""}>
        {line.label}
      </span>,
      <span
        key="amount"
        className={`whitespace-nowrap tabular-nums ${line.emphasis ? "font-semibold" : ""} ${
          Number(line.value) < 0 ? "text-destructive" : ""
        }`}
      >
        {formatNaira(line.value)}
      </span>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Budget Summary" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Budget Summary</h1>
            <InfoGuide guideKey="expenditure.budgetSummary" />
          </div>
          <p className="text-muted-foreground">
            Income from fees, less what the school has spent. Choose the session above; every figure and
            export follows it.
          </p>
        </div>
        <BrandedReportExport title={`Budget Summary · ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilterBar
          basePath={listPath}
          filters={shown}
          sessions={sessions}
          searchPlaceholder="Search a line of the reconciliation"
        />
      )}

      <div className="grid gap-3 print:grid-cols-3 print:gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <BalanceTile label="Balance forward" hint="Collected, less paid out" value={data.actualBalance} />
        <BalanceTile
          label="After commitments"
          hint="Also subtracts approved but unpaid"
          value={data.committedBalance}
        />
        <BalanceTile
          label="If all debt is paid"
          hint="Net expected income, less paid out"
          value={data.expectedBalance}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle>Income</CardTitle>
            <CardDescription>From the finance accumulated fund for {scope}.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Scheduled school fees" value={data.income.scheduledFees} />
              <Line label="Discounts" value={data.income.discounts} negative />
              <Line label="Exemptions" value={data.income.exemptions} negative />
              <Line label="Net expected income" value={data.income.netExpected} strong />
              <Line label="Fees actually collected" value={data.income.paid} strong />
              <Line label="Outstanding debt" value={data.income.outstanding} />
            </dl>
          </CardContent>
        </Card>

        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle>Expenditure</CardTitle>
            <CardDescription>
              Only paid expenditure leaves the balance; the rest is committed. Approved payroll
              counts as committed from the moment it is approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Paid" value={data.expenditure.paid} strong />
              <Line label="Approved, not yet paid" value={data.expenditure.approvedUnpaid} />
              {Number(data.expenditure.payrollApprovedUnpaid) > 0 && (
                <Line label="  of which approved payroll" value={data.expenditure.payrollApprovedUnpaid} />
              )}
              <Line label="Awaiting approval" value={data.expenditure.pending} />
              <Line label="Committed (paid + approved)" value={data.expenditure.committed} strong />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the balance is reached</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "line" : "lines"} · {scope}. Balance forward = fees collected
            − expenditure paid; cancelled and rejected vouchers count for nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">{scope}</p>
          <DataTable
            columns={lineColumns}
            rows={tableRows}
            unit="lines"
            searchable={false}
            emptyMessage={search ? "No line matches that search." : "Nothing to reconcile yet."}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceTile({ label, hint, value }: { label: string; hint: string; value: string }) {
  const negative = Number(value) < 0

  return (
    <div className="rounded-lg border p-3 print:p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
          negative ? "text-destructive" : ""
        }`}
      >
        {formatNaira(value, { kobo: false })}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Line({
  label,
  value,
  strong,
  negative,
}: {
  label: string
  value: string
  strong?: boolean
  negative?: boolean
}) {
  return (
    <div className={`flex justify-between gap-4 border-b pb-2 last:border-0 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">
        {negative ? "−" : ""}
        {formatNaira(value)}
      </dd>
    </div>
  )
}
