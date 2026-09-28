import { getFinanceAdjustments, getFinanceSetupData } from "@/app/actions/finance"
import { AdjustmentsNav } from "@/components/finance/adjustments-nav"
import { PeriodFilterBar } from "@/components/reports/period-filter-bar"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  countPeriodFilters,
  describePeriodFilters,
  parsePeriodFilters,
  reconcilePeriodFilters,
} from "@/lib/period-filters"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, sumAmounts } from "@/lib/money"

const columns: DataTableColumn[] = [
  { label: "Student", width: "18%" },
  { label: "Class", width: "8%" },
  { label: "Fee", width: "20%" },
  { label: "Basis", width: "12%" },
  { label: "Amount", align: "right", width: "12%" },
  { label: "Reason", width: "20%" },
  { label: "Recorded", width: "10%" },
]

/**
 * Every discount or exemption the school has granted.
 *
 * Money taken off a fee is money nobody will chase, so this is the record somebody answers
 * for — and it is a screen of its own rather than a panel under the form that grants them,
 * because auditing what was given away and giving something away are different jobs.
 */
export async function AdjustmentRecordsView({
  basePath,
  mode,
  searchParams,
}: {
  basePath: string
  mode: "discount" | "exemption"
  searchParams: Record<string, string | string[] | undefined>
}) {
  const section = mode === "discount" ? "discounts" : "exemptions"
  const listPath = `${basePath}/${section}/records`

  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const filters = reconcilePeriodFilters(parsePeriodFilters(searchParams), terms)

  const adjustments = await getFinanceAdjustments({ termId: filters.termId ?? null })
  if (!adjustments.success) {
    return <p className="text-destructive">{adjustments.error}</p>
  }

  const all = mode === "discount" ? adjustments.data.discounts : adjustments.data.exemptions

  // The search runs over the rows the filters returned: a reason is free text and a class is
  // the student's current one, neither of which the query can narrow on.
  const search = filters.search?.toLowerCase()
  const rows = search
    ? all.filter((row) =>
        [row.studentName, row.admissionNo, row.className ?? "", row.feeName, row.reason]
          .join(" ")
          .toLowerCase()
          .includes(search),
      )
    : all

  const scope = describePeriodFilters(filters, { sessions, terms })
  const filtered = countPeriodFilters(filters) > 0
  const total = sumAmounts(rows.map((row) => row.amount))
  const students = new Set(rows.map((row) => row.studentId)).size
  const largest = rows.reduce((most, row) => (Number(row.amount) > Number(most) ? row.amount : most), "0")

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: `${basePath}/students/${row.studentId}/statement`,
    search: [row.studentName, row.admissionNo, row.className ?? "", row.feeName, row.reason].join(" "),
    cells: [
      <div key="student" className="min-w-0">
        <div className="font-medium">{row.studentName}</div>
        <div className="text-xs text-muted-foreground">{row.admissionNo}</div>
      </div>,
      <span key="class" className="whitespace-nowrap">
        {row.className ?? "-"}
      </span>,
      <div key="fee" className="min-w-0">
        <div>{row.feeName}</div>
        <div className="text-xs text-muted-foreground">
          {[row.categoryName, row.termName].filter(Boolean).join(" · ")}
        </div>
      </div>,
      // What was approved, as opposed to what it came to: "25%" and "₦11,250" are different
      // facts, and an audit wants both.
      <span key="basis" className="whitespace-nowrap text-xs text-muted-foreground">
        {row.type === "PERCENTAGE"
          ? `${Number(row.value)}% of the fee`
          : row.type === "FULL"
            ? "Whole fee"
            : "Fixed amount"}
      </span>,
      <span key="amount" className="whitespace-nowrap font-semibold tabular-nums">
        {formatNaira(row.amount)}
      </span>,
      <span key="reason" className="text-xs text-muted-foreground">
        {row.reason}
      </span>,
      <div key="recorded" className="whitespace-nowrap text-xs text-muted-foreground">
        <div>{formatDocumentDate(row.createdAt)}</div>
        {row.approvedBy && <div>by {row.approvedBy}</div>}
      </div>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <AdjustmentsNav basePath={basePath} mode={mode} active="records" />

      {setup.success && (
        <PeriodFilterBar
          basePath={listPath}
          filters={filters}
          sessions={sessions}
          terms={terms}
          searchPlaceholder="Search student, class, fee or reason"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Recorded</p>
          <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Taken off fees</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(total)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Students</p>
          <p className="text-2xl font-bold tabular-nums">{students}</p>
          <p className="text-xs text-muted-foreground">at least one granted</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Largest single</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(largest)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recorded {section}</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? mode : section} · {formatNaira(total)} taken off fees
            {filtered ? ` · ${scope}` : " · all sessions and terms"}
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit={section}
            searchable={false}
            emptyMessage={
              filtered
                ? `No ${mode} matches these filters. Remove one of the chips above, or clear them all.`
                : `No ${section} recorded yet.`
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
