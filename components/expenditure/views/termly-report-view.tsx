import { getExpenditureSetupData, getTermlyExpenditureReport } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { SpendBarChart } from "@/components/reports/spend-bar-chart"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PeriodFilterBar } from "@/components/reports/period-filter-bar"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"
import { parsePeriodFilters, reconcilePeriodFilters } from "@/lib/period-filters"

// Four columns totalling 100%. Both breakdown tables fit a portrait sheet, so no landscape
// switch here — the wide reports are the transaction list and the payment chart.
const categoryColumns: DataTableColumn[] = [
  { label: "Category", width: "34%" },
  { label: "Paid", align: "right", width: "22%" },
  { label: "Count", align: "right", width: "12%" },
  { label: "Against budget", width: "32%" },
]

const accountColumns: DataTableColumn[] = [
  { label: "Account", width: "52%" },
  { label: "Paid", align: "right", width: "30%" },
  { label: "Count", align: "right", width: "18%" },
]

const paymentColumns: DataTableColumn[] = [
  { label: "Date", width: "14%" },
  { label: "Voucher", width: "16%" },
  { label: "Payee", width: "32%" },
  { label: "Category", width: "20%" },
  { label: "Amount", align: "right", width: "18%" },
]

/**
 * What one term spent, and on what.
 *
 * The term used to be chosen from a row of buttons, which grew by three every academic year
 * and showed "Third Term" twice with nothing to say which session each belonged to. It is a
 * filter bar now, like every other report: session narrows the terms, the term names its
 * session where the name repeats, and both live in the URL so a term's figures are a link.
 *
 * The chart is the point of the screen. "What did the term go on" is a ranking question, and
 * a ranking is read off bars faster than off a column of naira.
 */
export async function TermlyExpenditureReportView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/reports/termly`

  const setup = await getExpenditureSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  // A term settles its own session, and a term this school no longer has is dropped rather
  // than queried on — it is usually a bookmark from a removed school year.
  const filters = reconcilePeriodFilters(parsePeriodFilters(searchParams), terms)

  const report = await getTermlyExpenditureReport({
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
  })
  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const { data } = report
  const scope = [data.sessionName, data.termName].filter(Boolean).join(" · ") || "All terms"

  // The report always reads over one term — it opens on the current one when the URL names
  // none. So the bar is shown the term that was actually used, not an empty selection: a
  // "All terms" select above one term's figures is the screen lying about its own scope.
  const shown = {
    ...filters,
    sessionId: filters.sessionId ?? data.sessionId ?? undefined,
    termId: filters.termId ?? data.termId ?? undefined,
  }

  // The search is applied here rather than in the query: the report is one term's worth of
  // rows, and searching what it returned keeps a single round trip.
  const search = filters.search?.toLowerCase()
  const matches = (...fields: Array<string | null | undefined>) =>
    !search || fields.filter(Boolean).join(" ").toLowerCase().includes(search)

  const categories = data.byCategory.filter((row) => matches(row.name))
  const accounts = data.byAccount.filter((row) => matches(row.name))
  const payments = data.topTransactions.filter((row) =>
    matches(row.payeeName, row.voucherNo, row.categoryName),
  )

  const overBudget = data.byCategory.filter((row) => row.overBy)

  const exportTable: ExportTable = {
    columns: ["Category", "Paid", "Transactions", "Budget Limit", "Over By"],
    rows: categories.map((row) => [
      row.name,
      formatNairaPlain(row.amount),
      String(row.count),
      row.budgetLimit ? formatNairaPlain(row.budgetLimit) : "-",
      row.overBy ? formatNairaPlain(row.overBy) : "-",
    ]),
    csvRows: categories.map((row) => [
      row.name,
      toCsvAmount(row.amount),
      String(row.count),
      row.budgetLimit ? toCsvAmount(row.budgetLimit) : "",
      row.overBy ? toCsvAmount(row.overBy) : "",
    ]),
  }

  const categoryRows: DataTableRow[] = categories.map((row) => ({
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
      row.budgetLimit ? (
        row.overBy ? (
          <span key="budget" className="whitespace-nowrap text-destructive">
            Over by {formatNaira(row.overBy)}
          </span>
        ) : (
          <span key="budget" className="whitespace-nowrap text-muted-foreground">
            Within {formatNaira(row.budgetLimit)}
          </span>
        )
      ) : (
        <span key="budget" className="text-muted-foreground">
          No limit set
        </span>
      ),
    ],
  }))

  const accountRows: DataTableRow[] = accounts.map((row) => ({
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

  const paymentRows: DataTableRow[] = payments.map((row) => ({
    id: row.id,
    href: `${basePath}/transactions/${row.id}`,
    search: [row.payeeName, row.voucherNo, row.categoryName].join(" "),
    cells: [
      <span key="date" className="whitespace-nowrap">
        {formatDocumentDate(row.expenseDate)}
      </span>,
      <span key="voucher" className="font-medium">
        {row.voucherNo}
      </span>,
      <span key="payee">{row.payeeName}</span>,
      <span key="category">{row.categoryName}</span>,
      <span key="amount" className="whitespace-nowrap font-semibold tabular-nums">
        {formatNaira(row.amount)}
      </span>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Termly Expenditure" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Termly Expenditure</h1>
            <InfoGuide guideKey="expenditure.termlyReport" />
          </div>
          <p className="text-muted-foreground">
            What was spent in one term, and on what. Choose the session and term above; the figures, the
            chart and every export follow it.
          </p>
        </div>
        <BrandedReportExport title={`Termly Expenditure · ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilterBar
          basePath={listPath}
          filters={shown}
          sessions={sessions}
          terms={terms}
          searchPlaceholder="Search category, account, payee or voucher"
        />
      )}

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(data.paid, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">money actually out</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Committed</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(data.committed, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">approved, paid or not</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(data.pending, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">not yet authorised</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Over budget</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              overBudget.length > 0 ? "text-destructive" : ""
            }`}
          >
            {overBudget.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {overBudget.length === 0
              ? `${data.transactionCount} vouchers in the term`
              : overBudget.map((row) => row.name).join(", ")}
          </p>
        </div>
      </div>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>Where the term went</CardTitle>
          <CardDescription>
            Paid expenditure by category, largest first{scope === "All terms" ? "" : ` · ${scope}`}. A
            category past its ceiling is drawn in red — the limit is reported against, never enforced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.byCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing was paid out in this term.
            </p>
          ) : (
            <SpendBarChart rows={data.byCategory} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
            <CardDescription>
              {categories.length} {categories.length === 1 ? "category" : "categories"} · {scope}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={categoryColumns}
              rows={categoryRows}
              pageSize={8}
              unit="categories"
              searchable={false}
              emptyMessage={
                search ? "No category matches that search." : "Nothing paid out in this term."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Account</CardTitle>
            <CardDescription>Which cash source or account the money left from.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={accountColumns}
              rows={accountRows}
              pageSize={8}
              unit="accounts"
              searchable={false}
              emptyMessage={search ? "No account matches that search." : "Nothing paid out in this term."}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Largest Payments</CardTitle>
          <CardDescription>
            The ten biggest paid vouchers in this term. Open one to see the voucher behind it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={paymentColumns}
            rows={paymentRows}
            unit="payments"
            searchable={false}
            emptyMessage={search ? "No payment matches that search." : "No payments in this term."}
          />
        </CardContent>
      </Card>
    </div>
  )
}
