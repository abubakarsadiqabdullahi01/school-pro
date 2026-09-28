import { getClassPaymentSummary, getFinanceSetupData } from "@/app/actions/finance"
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
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

// The seven columns total 100%, so the printed table fills the page. Only the class column
// wraps — it carries the class over its term.
const columns: DataTableColumn[] = [
  { label: "Class", width: "18%" },
  { label: "Students", align: "right", width: "9%" },
  { label: "Expected", align: "right", width: "14%" },
  { label: "Paid", align: "right", width: "14%" },
  { label: "Outstanding", align: "right", width: "14%" },
  { label: "Charges", width: "21%" },
  { label: "Collected", align: "right", width: "10%" },
]

/**
 * How much each class has been billed and how much of it has come in.
 *
 * The status counts are charges, not students: a class of ten with two fees has twenty
 * charges, and reading "18 paid" as eighteen children is the mistake this column used to
 * invite. The collection percentage is what the review actually turns on, so it is the last
 * word on every row and the headline above the table.
 */
export async function ClassSummaryView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/class-summary`

  // Setup is read first because it settles the filters: a term id from a bookmark may belong
  // to a school year this school no longer has, and the query should not be built on it.
  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const classTerms = setup.success ? setup.data.classTerms : []
  const filters = reconcilePeriodFilters(parsePeriodFilters(searchParams), terms)

  const summary = await getClassPaymentSummary({
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
    classTermId: filters.classTermId ?? null,
  })
  if (!summary.success) {
    return <p className="text-destructive">{summary.error}</p>
  }

  // The search runs over the rows the filters returned rather than as another query: the
  // report is one aggregate, and a class name is matched in the same place it is displayed.
  const search = filters.search?.toLowerCase()
  const rows = search
    ? summary.data.filter((row) => `${row.className} ${row.termName}`.toLowerCase().includes(search))
    : summary.data

  const scope = describePeriodFilters(filters, { sessions, terms, classTerms })
  const filtered = countPeriodFilters(filters) > 0
  const expected = sumAmounts(rows.map((row) => row.expected))
  const paid = sumAmounts(rows.map((row) => row.paid))
  const outstanding = sumAmounts(rows.map((row) => row.outstanding))
  const students = rows.reduce((total, row) => total + row.students, 0)
  const collected = expected.isZero() ? 0 : Math.round(paid.div(expected).times(1000).toNumber()) / 10

  // The status counts are split into their own columns for export: "3 paid · 1 partial"
  // reads fine on screen but cannot be filtered or summed in a spreadsheet.
  const exportTable: ExportTable = {
    columns: [
      "Class",
      "Term",
      "Students",
      "Expected",
      "Paid",
      "Outstanding",
      "Charges Paid",
      "Charges Part Paid",
      "Charges Unpaid",
      "Collected %",
    ],
    rows: rows.map((row) => [
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
    csvRows: rows.map((row) => [
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

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.classTermId,
    search: `${row.className} ${row.termName}`,
    cells: [
      <div key="class" className="min-w-0">
        <div className="font-medium">{row.className}</div>
        <div className="text-xs text-muted-foreground">{row.termName}</div>
      </div>,
      <span key="students" className="tabular-nums">
        {row.students}
      </span>,
      <span key="expected" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.expected)}
      </span>,
      <span key="paid" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.paid)}
      </span>,
      <span key="outstanding" className="whitespace-nowrap font-medium tabular-nums">
        {formatNaira(row.outstanding)}
      </span>,
      <span key="charges" className="text-xs tabular-nums text-muted-foreground">
        {row.paidCount} paid
        {row.partialCount > 0 ? ` · ${row.partialCount} part paid` : ""}
        {row.unpaidCount > 0 ? ` · ${row.unpaidCount} unpaid` : ""}
      </span>,
      <span
        key="collected"
        className={
          row.collectionRate >= 80
            ? "font-semibold tabular-nums text-emerald-600 dark:text-emerald-500"
            : row.collectionRate >= 50
              ? "font-semibold tabular-nums"
              : "font-semibold tabular-nums text-amber-600 dark:text-amber-500"
        }
      >
        {row.collectionRate}%
      </span>,
    ],
  }))

  return (
    // `data-print-landscape` is deliberately absent: the named page it switches on is barely
    // supported and cost a blank first sheet on the receipt register without rotating
    // anything. The columns above are sized to fit portrait instead.
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Class Payment Summary" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Class Payment Summary</h1>
            <InfoGuide guideKey="finance.classSummary" />
          </div>
          <p className="text-muted-foreground">
            What each class was billed, what has come in, and what is still out — by session, term or a single
            class.
          </p>
        </div>
        <BrandedReportExport
          title={`Class Payment Summary · ${scope}`}
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
          classTerms={classTerms}
          searchPlaceholder="Search by class or term"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Classes</p>
          <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
          {/* Summed across class-terms, so a child enrolled all year counts three times. Saying
              "students" here would read as a roll and contradict the student list. */}
          <p className="text-xs text-muted-foreground">
            {students} billed place{students === 1 ? "" : "s"} · one per student per term
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Expected</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(expected, { kobo: false })}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(paid, { kobo: false })}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(outstanding, { kobo: false })}</p>
          <p className="text-xs text-muted-foreground">{collected}% collected</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Summary</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "class" : "classes"} · {formatNaira(paid)} of{" "}
            {formatNaira(expected)} collected
            {filtered ? ` · ${scope}` : " · all sessions and terms"}
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="classes"
            searchable={false}
            emptyMessage={
              filtered
                ? "No class matches these filters. Remove one of the chips above, or clear them all."
                : "No class has been billed yet."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
