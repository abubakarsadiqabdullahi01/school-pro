import Link from "next/link"

import { getFeeSchedules, getFinanceSetupData } from "@/app/actions/finance"
import { BillNewStudentsButton } from "@/components/finance/bill-new-students-button"
import { FeeScheduleFilterBar } from "@/components/finance/fee-schedule-filter-bar"
import { FeeSetupNav } from "@/components/finance/fee-setup-nav"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  FEE_AUDIENCES,
  countFeeFilters,
  describeScheduleFilters,
  parseScheduleFilters,
  reconcileScheduleFilters,
} from "@/lib/finance/fee-setup-filters"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

// The seven text columns share what is left after the button, which is a fixed size whatever
// the screen is. Only the fee, its category and the scope are allowed to wrap.
const columns: DataTableColumn[] = [
  { label: "Fee", width: "22%" },
  { label: "Category", width: "14%" },
  { label: "Scope", width: "16%" },
  { label: "Applies to", width: "11%" },
  { label: "Amount", align: "right", width: "10%" },
  // Billed on its own is not a fact anybody can act on: 60 is right for a class of 60 and a
  // hole for a class of 62. The number in scope is what turns it into one.
  { label: "Billed", align: "right", width: "15%" },
  { label: "Due", width: "12%" },
  // `printHidden` also marks the column as controls rather than content, so a click in it
  // works the button rather than opening the row.
  { label: "", printHidden: true, width: "10rem" },
]

const audienceLabel = (value: string) =>
  FEE_AUDIENCES.find((option) => option.value === value)?.label ?? value

/**
 * The fee schedules, which are the instructions that actually bill students.
 *
 * Each row carries the number of charges it has raised, because that is the figure that
 * exposes the failure this screen exists to catch: a schedule billing fewer students than
 * the class holds means somebody was admitted after it ran and owes nothing on paper.
 */
export async function FeeSchedulesView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const registerPath = `${basePath}/fees`

  // Setup is read first because it settles the filters: a term id from a bookmark may belong
  // to a school year this school no longer has, and the query should not be built on it.
  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const categories = setup.success ? setup.data.categories : []
  const filters = reconcileScheduleFilters(parseScheduleFilters(searchParams), terms)

  const schedules = await getFeeSchedules(filters)
  if (!schedules.success) {
    return <p className="text-destructive">{schedules.error}</p>
  }

  const { rows, totalCount, activeCount, studentsBilled, studentsUnbilled } = schedules.data
  const scope = describeScheduleFilters(filters, { sessions, terms, categories })
  const filtered = countFeeFilters(filters) > 0

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: `${basePath}/fees/schedules/${row.id}`,
    search: [row.name, row.categoryName, row.scopeLabel, row.sessionName].join(" "),
    // Keyed because this array is built on the server and crosses into the client payload,
    // where React checks the elements in a list for keys.
    cells: [
      <div key="fee" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {!row.isActive && <Badge variant="secondary">Inactive</Badge>}
          {!row.isMandatory && <Badge variant="outline">Optional</Badge>}
        </div>
        {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
      </div>,
      <span key="category">{row.categoryName}</span>,
      <div key="scope" className="min-w-0">
        <div>{row.scopeLabel}</div>
        <div className="text-xs text-muted-foreground">{row.sessionName}</div>
      </div>,
      <span key="audience">{audienceLabel(row.appliesTo)}</span>,
      <span key="amount" className="whitespace-nowrap font-semibold">
        {formatNaira(row.amount)}
      </span>,
      <div key="billed" className="whitespace-nowrap">
        {/* "of 0" would be nonsense: a schedule for a term nobody is enrolled in any more
            has nobody left to bill, so the charge count is the whole story. */}
        <span className="tabular-nums">
          {row.inScope > 0 ? `${row.chargeCount} of ${row.inScope}` : row.chargeCount}
        </span>
        {row.unbilled > 0 && (
          <div
            className={
              row.isActive
                ? "text-xs font-medium text-amber-600 dark:text-amber-500"
                : "text-xs text-muted-foreground"
            }
          >
            {row.unbilled} not billed
          </div>
        )}
      </div>,
      <span key="due" className="whitespace-nowrap text-muted-foreground">
        {row.dueDate ? formatDocumentDate(row.dueDate) : "—"}
      </span>,
      <BillNewStudentsButton
        key="actions"
        scheduleId={row.id}
        scheduleName={row.name}
        disabled={!row.isActive}
      />,
    ],
  }))

  return (
    <div className="space-y-6">
      <FeeSetupNav basePath={basePath} active="schedules" />

      <FeeScheduleFilterBar
        basePath={registerPath}
        filters={filters}
        sessions={sessions}
        terms={terms}
        categories={categories}
      />

      <Card>
        <CardHeader>
          <CardTitle>Fee Schedules</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "schedule" : "schedules"}
            {filtered ? ` of ${totalCount}` : ""} · {activeCount} active · {studentsBilled} student
            {studentsBilled === 1 ? "" : "s"} billed
            {filtered ? ` · ${scope}` : ""}
          </CardDescription>
          {studentsUnbilled > 0 && (
            // The one number on this screen that asks for something to be done.
            <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
              {studentsUnbilled} student{studentsUnbilled === 1 ? " is" : "s are"} in scope of an active
              schedule with no charge raised. Open the schedule to see who, and bill them.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {/* Students are billed when they join a class. `Bill new students` is for anyone
              admitted before a schedule existed — it only adds what is missing, so it is
              safe to press twice. */}
          {/* A row opens the schedule's coverage — who it bills, who it has billed and who
              it has missed — and editing is a click further in from there. */}
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="schedules"
            searchable={false}
            emptyMessage={
              filtered
                ? "No fee schedule matches these filters. Remove one of the chips above, or clear them all."
                : "No fee schedules yet. Create one to start billing."
            }
          />
          {rows.length === 0 && !filtered && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${basePath}/fees/schedules/new`}>New fee schedule</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
