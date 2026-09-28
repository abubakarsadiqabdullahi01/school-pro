import Link from "next/link"

import { getHrSetupData } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { PayComponentFilterBar } from "@/components/hr/pay-component-filter-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import type { ExportTable } from "@/components/reports/report-export"
import { SpendBarChart } from "@/components/reports/spend-bar-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import {
  componentKindLabel,
  componentValueLabel,
  countPayComponentFilters,
  deductionTimingLabel,
  describePayComponentFilters,
  matchesPayComponent,
  parsePayComponentFilters,
} from "@/lib/hr/pay-component-filters"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"

type Kind = "allowance" | "deduction"

const COPY = {
  allowance: {
    title: "Allowances",
    plural: "allowances",
    guide: "hr.allowances",
    lead: "What the school adds to gross pay. A percentage is taken from base salary, so it scales with a part month.",
    chart: "What each allowance costs a month",
    chartNote:
      "Assigned value × the number of staff on it, largest first. A percentage is worked out against each person's own base salary.",
    section: "Allowances",
    sectionNote:
      "An allowance that has ever been assigned is retired rather than deleted: its name is on payslips already issued, and those have to keep resolving.",
    empty: "No allowances yet. Create the first thing the school adds to pay.",
    guideKey: "hr.allowances",
  },
  deduction: {
    title: "Deductions",
    plural: "deductions",
    guide: "hr.deductions",
    lead: "What comes off gross pay, before or after tax. Before-tax ones reduce the figure a percentage tax is then worked out on.",
    chart: "What each deduction recovers a month",
    chartNote:
      "Assigned value × the number of staff on it, largest first. A percentage is worked out against each person's own base salary.",
    section: "Deductions",
    sectionNote:
      "A deduction that has ever been assigned is retired rather than deleted: its name is on payslips already issued, and those have to keep resolving.",
    empty: "No deductions yet. Create the first thing that comes off pay.",
    guideKey: "hr.deductions",
  },
} as const

/**
 * The allowances or the deductions the school has defined.
 *
 * One view for both, because they are the same object with one extra question: a deduction
 * also has to say whether it comes off before or after tax. Each used to be a create form
 * stacked above a table whose only action was Retire — no rename, no way to correct a
 * percentage typed as 80 instead of 8. Creating and managing are their own screens now.
 *
 * The monthly figure is the column that makes the list worth reading. A 20% housing
 * allowance is meaningless next to a ₦15,000 transport one until both are costed.
 */
export async function PayComponentsView({
  basePath,
  searchParams,
  kind,
  canManage,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
  kind: Kind
  canManage: boolean
}) {
  const copy = COPY[kind]
  const listPath = `${basePath}/${copy.plural}`
  const filters = parsePayComponentFilters(searchParams)

  const setup = await getHrSetupData()
  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  // The staff base salaries, so a percentage component can be costed rather than left as a
  // bare "20%" that nobody can add up.
  const baseByStaff = setup.data.scales
  const averageBase =
    baseByStaff.length === 0
      ? 0
      : baseByStaff.reduce((total, scale) => total + Number(scale.baseSalary) * scale.staffCount, 0) /
        Math.max(
          1,
          baseByStaff.reduce((total, scale) => total + scale.staffCount, 0),
        )

  const all = kind === "allowance" ? setup.data.allowanceTypes : setup.data.deductionTypes

  /** What one assignment of this component is worth a month, at the average base salary. */
  const monthlyEach = (row: { kind: string; value: string }) =>
    row.kind === "PERCENTAGE" ? (averageBase * Number(row.value)) / 100 : Number(row.value)

  const monthlyTotal = (row: { kind: string; value: string; assignedCount: number }) =>
    String(monthlyEach(row) * row.assignedCount)

  const search = filters.search?.toLowerCase()
  const rows = all
    .filter((row) => matchesPayComponent(row, filters))
    .filter((row) => (search ? row.name.toLowerCase().includes(search) : true))

  const filtered = countPayComponentFilters(filters) > 0
  const scope = describePayComponentFilters(filters, copy.plural)

  const activeCount = rows.filter((row) => row.isActive).length
  const unused = rows.filter((row) => row.assignedCount === 0)
  const assignments = rows.reduce((total, row) => total + row.assignedCount, 0)
  const total = sumAmounts(rows.map(monthlyTotal))

  const exportColumns =
    kind === "allowance"
      ? ["Name", "Type", "Value", "Taxable", "Recurring", "Assigned", "Monthly Cost", "Status"]
      : ["Name", "Type", "Value", "Applies", "Recurring", "Assigned", "Monthly Total", "Status"]

  const exportTable: ExportTable = {
    columns: exportColumns,
    rows: rows.map((row) => [
      row.name,
      componentKindLabel(row.kind),
      componentValueLabel(row.kind, row.value, formatNairaPlain),
      kind === "allowance"
        ? "isTaxable" in row && row.isTaxable
          ? "Taxable"
          : "Not taxable"
        : deductionTimingLabel("timing" in row ? String(row.timing) : ""),
      row.isRecurring ? "Yes" : "No",
      String(row.assignedCount),
      formatNairaPlain(monthlyTotal(row)),
      row.isActive ? "Active" : "Retired",
    ]),
    csvRows: rows.map((row) => [
      row.name,
      row.kind,
      row.value,
      kind === "allowance"
        ? "isTaxable" in row && row.isTaxable
          ? "TAXABLE"
          : "NOT_TAXABLE"
        : "timing" in row
          ? String(row.timing)
          : "",
      row.isRecurring ? "YES" : "NO",
      String(row.assignedCount),
      toCsvAmount(monthlyTotal(row)),
      row.isActive ? "Active" : "Retired",
    ]),
  }

  const columns: DataTableColumn[] = [
    { label: "Name", width: "26%" },
    { label: "Value", align: "right", width: "14%" },
    { label: kind === "allowance" ? "Taxable" : "Applies", width: "15%" },
    { label: "Assigned", align: "right", width: "11%" },
    { label: kind === "allowance" ? "Monthly cost" : "Monthly total", align: "right", width: "18%" },
    { label: "Status", width: "16%" },
  ]

  // Keyed because this array is built on the server and crosses into the client payload,
  // where React checks the elements of a list for keys.
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: canManage ? `${listPath}/${row.id}` : undefined,
    search: row.name,
    cells: [
      <div key="name" className="min-w-0">
        <div className="font-medium">{row.name}</div>
        <p className="text-xs text-muted-foreground">
          {componentKindLabel(row.kind)}
          {row.isRecurring ? " · every month" : " · one off"}
        </p>
      </div>,
      <span key="value" className="whitespace-nowrap tabular-nums">
        {componentValueLabel(row.kind, row.value, formatNaira)}
      </span>,
      <span key="applies" className="whitespace-nowrap text-sm">
        {kind === "allowance"
          ? "isTaxable" in row && row.isTaxable
            ? "Taxable"
            : "Not taxable"
          : deductionTimingLabel("timing" in row ? String(row.timing) : "")}
      </span>,
      <span key="assigned" className="tabular-nums">
        {row.assignedCount}
      </span>,
      <span key="monthly" className="whitespace-nowrap tabular-nums">
        {row.assignedCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatNaira(monthlyTotal(row))
        )}
      </span>,
      <div key="status" className="flex flex-col gap-1">
        <Badge variant={row.isActive ? "default" : "secondary"} className="w-fit print:hidden">
          {row.isActive ? "Active" : "Retired"}
        </Badge>
        <span className="hidden print:block">{row.isActive ? "Active" : "Retired"}</span>
      </div>,
    ],
  }))

  const footerCells = [
    <span key="label" className="font-semibold">
      {filtered ? "FILTERED TOTAL" : "TOTAL"}
    </span>,
    <span key="value" />,
    <span key="applies" />,
    <span key="assigned" className="tabular-nums">
      {assignments}
    </span>,
    <span key="monthly" className="whitespace-nowrap tabular-nums">
      {formatNaira(total)}
    </span>,
    <span key="status" />,
  ]

  const costed = [...rows]
    .filter((row) => row.assignedCount > 0)
    .sort((a, b) => Number(monthlyTotal(b)) - Number(monthlyTotal(a)))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title={copy.title} reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
            <InfoGuide guideKey={copy.guideKey} />
          </div>
          <p className="text-muted-foreground">{copy.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandedReportExport
            title={`${copy.title} · ${scope}`}
            subtitle={scope}
            table={exportTable}
            orientation="landscape"
          />
          {canManage && (
            <Button asChild>
              <Link href={`${listPath}/new`}>New {kind}</Link>
            </Button>
          )}
        </div>
      </div>

      <PayComponentFilterBar
        basePath={listPath}
        filters={filters}
        searchPlaceholder={`${copy.title.slice(0, -1)} name`}
        showTiming={kind === "deduction"}
      />

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Defined</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{rows.length}</p>
          <p className="text-xs text-muted-foreground">
            {filtered ? `of ${all.length} in the school` : `${activeCount} active`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Assignments</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{assignments}</p>
          <p className="text-xs text-muted-foreground">across all staff</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">
            {kind === "allowance" ? "Added a month" : "Recovered a month"}
          </p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(total, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">at the average base salary</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Nobody on it</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{unused.length}</p>
          <p className="text-xs text-muted-foreground">
            {unused.length === 0 ? "all in use" : unused.map((row) => row.name).join(", ")}
          </p>
        </div>
      </div>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{copy.chart}</CardTitle>
          <CardDescription>{copy.chartNote}</CardDescription>
        </CardHeader>
        <CardContent>
          {costed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing is assigned yet, so there is nothing to compare.
            </p>
          ) : (
            <SpendBarChart
              rows={costed.map((row) => ({
                name: row.name,
                amount: monthlyTotal(row),
                budgetLimit: null,
                overBy: null,
              }))}
              valueLabel={kind === "allowance" ? "Monthly cost" : "Monthly total"}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>{copy.section}</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? kind : copy.plural}
            {filtered ? ` of ${all.length}` : ""} · {copy.sectionNote}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">{scope}</p>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit={copy.plural}
            searchable={false}
            footer={footerCells}
            emptyMessage={
              filtered
                ? `No ${kind} matches these filters. Remove one of the chips above, or clear them all.`
                : copy.empty
            }
          />
          {rows.length === 0 && !filtered && canManage && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${listPath}/new`}>New {kind}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
