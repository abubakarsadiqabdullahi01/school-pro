import { getDebtorsReport, getFinanceSetupData, type DebtorFilters } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { DebtorsFilterBar } from "@/components/finance/debtors-filter-bar"
import { DebtorsTable } from "@/components/finance/views/debtors-table"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  countDebtorFilters,
  debtorFilterChips,
  describeDebtorFilters,
  parseDebtorFilters,
  parseMinBalance,
  reconcileDebtorFilters,
} from "@/lib/finance/debtor-filters"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * Who owes the school money, and how much.
 *
 * The figure that matters is the total, not the row count: "55 students owing" is a queue
 * length, and what a bursar reports upwards is the naira behind it. Both are here, and both
 * describe the filtered slice rather than the whole school, with the slice named beside them
 * so a printed copy cannot be mistaken for the full list.
 */
export async function DebtorsView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/debtors`

  // Setup is read first because it settles the filters: a term id from a bookmark may belong
  // to a school year this school no longer has, and the query should not be built on it.
  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const classTerms = setup.success ? setup.data.classTerms : []
  const filters = reconcileDebtorFilters(parseDebtorFilters(searchParams), terms)

  const applied: DebtorFilters = {
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
    classTermId: filters.classTermId ?? null,
    minBalance: parseMinBalance(filters.minBalance),
    paymentStatus: (filters.paymentStatus as DebtorFilters["paymentStatus"]) ?? null,
    studentType: (filters.studentType as DebtorFilters["studentType"]) ?? null,
  }

  const report = await getDebtorsReport(applied)
  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  // The text search is applied here rather than in the query: the report is already narrowed
  // by the filters above, and searching a name across the rows it returned keeps one round
  // trip instead of two.
  const search = filters.search?.toLowerCase()
  const rows = search
    ? report.data.filter((row) =>
        [row.studentName, row.admissionNo, row.className ?? "", row.parentContact ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(search),
      )
    : report.data

  const scope = describeDebtorFilters(filters, { sessions, terms, classTerms })
  const filtered = countDebtorFilters(filters) > 0
  const owed = sumAmounts(rows.map((row) => row.balance))
  const billed = sumAmounts(rows.map((row) => row.totalFees))
  const paid = sumAmounts(rows.map((row) => row.totalPaid))
  const neverPaid = rows.filter((row) => !row.lastPaymentDate).length

  const exportTable: ExportTable = {
    columns: [
      "Student",
      "Admission No",
      "Class",
      "Billed",
      "Paid",
      "Adjustments",
      "Balance",
      "Last Payment",
      "Parent Contact",
    ],
    rows: rows.map((row) => [
      row.studentName,
      row.admissionNo,
      row.className ?? "-",
      formatNairaPlain(row.totalFees),
      formatNairaPlain(row.totalPaid),
      formatNairaPlain(Number(row.discounts) + Number(row.exemptions)),
      formatNairaPlain(row.balance),
      row.lastPaymentDate ? formatDocumentDate(row.lastPaymentDate) : "Never",
      row.parentContact ?? "-",
    ]),
    csvRows: rows.map((row) => [
      row.studentName,
      row.admissionNo,
      row.className ?? "",
      toCsvAmount(row.totalFees),
      toCsvAmount(row.totalPaid),
      toCsvAmount(Number(row.discounts) + Number(row.exemptions)),
      toCsvAmount(row.balance),
      row.lastPaymentDate ? row.lastPaymentDate.slice(0, 10) : "",
      row.parentContact ?? "",
    ]),
  }

  return (
    // `data-print-landscape` is deliberately absent: the named page it switches on is barely
    // supported, and it cost a blank first sheet on the receipt register for no rotation.
    // The columns are sized to fit portrait instead.
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Debtor Report" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Debtors</h1>
            <InfoGuide guideKey="finance.debtors" />
          </div>
          <p className="text-muted-foreground">
            Students with unpaid or partially paid charges. Narrow by session, term, class, status or
            amount, then work the list — Pay opens the counter with the student already chosen.
          </p>
        </div>
        <BrandedReportExport title={`Debtors · ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <DebtorsFilterBar
          basePath={listPath}
          filters={filters}
          sessions={sessions}
          terms={terms}
          classTerms={classTerms}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Students owing</p>
          <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total outstanding</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(owed)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Collected from them</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(paid)}</p>
          <p className="text-xs text-muted-foreground">of {formatNaira(billed)} billed</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Never paid anything</p>
          <p className="text-2xl font-bold tabular-nums">{neverPaid}</p>
          <p className="text-xs text-muted-foreground">no receipt on record</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Debtor Report</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "student" : "students"} owing {formatNaira(owed)}
            {filtered ? ` · ${scope}` : " · all sessions and terms"}
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          <DebtorsTable
            basePath={basePath}
            rows={rows}
            emptyMessage={
              debtorFilterChips(filters).length > 0
                ? "No debtor matches these filters. Remove one of the chips above, or clear them all."
                : "Nobody owes anything."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
