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
  countPayComponentFilters,
  describePayComponentFilters,
  matchesPayComponent,
  parsePayComponentFilters,
} from "@/lib/hr/pay-component-filters"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"

// Six columns totalling 100%, which fit a portrait sheet.
const columns: DataTableColumn[] = [
  { label: "Scale", width: "30%" },
  { label: "Grade / Step", width: "16%" },
  { label: "Base Salary", align: "right", width: "18%" },
  { label: "On Scale", align: "right", width: "12%" },
  { label: "Monthly Cost", align: "right", width: "16%" },
  { label: "Status", width: "8%" },
]

/**
 * The standard levels a salary can be based on.
 *
 * The screen used to be a create form stacked above the list, with Retire as the only thing
 * you could do to a scale — no rename, no correction, no way to move a base salary that had
 * been typed wrong. Creating and managing are their own screens now.
 *
 * The chart is the point: a salary structure is a shape, and "is anybody clustered at the
 * bottom of the scale" is read off bars far faster than off a column of naira. The bars are
 * the monthly cost of each scale, which is where the money actually is — six teachers on
 * ₦140,000 cost more than one principal on ₦320,000.
 */
export async function SalaryScalesView({
  basePath,
  searchParams,
  canManage,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
  canManage: boolean
}) {
  const listPath = `${basePath}/salary-scales`
  const filters = parsePayComponentFilters(searchParams)

  const setup = await getHrSetupData()
  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  const search = filters.search?.toLowerCase()
  const all = setup.data.scales
  const rows = all
    .map((scale) => ({ ...scale, assignedCount: scale.staffCount }))
    .filter((scale) => matchesPayComponent(scale, filters))
    .filter((scale) =>
      search
        ? [scale.name, scale.gradeLevel ?? "", scale.step ?? "", scale.description ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true,
    )

  const filtered = countPayComponentFilters(filters) > 0
  const scope = describePayComponentFilters(filters, "salary scales")

  const monthlyCost = (scale: { baseSalary: string; staffCount: number }) =>
    String(Number(scale.baseSalary) * scale.staffCount)

  const activeCount = rows.filter((scale) => scale.isActive).length
  const unused = rows.filter((scale) => scale.staffCount === 0)
  const onScale = rows.reduce((total, scale) => total + scale.staffCount, 0)
  const totalCost = sumAmounts(rows.map(monthlyCost))

  const exportTable: ExportTable = {
    columns: ["Scale", "Grade", "Step", "Base Salary", "On Scale", "Monthly Cost", "Status", "Description"],
    rows: rows.map((scale) => [
      scale.name,
      scale.gradeLevel ?? "-",
      scale.step ?? "-",
      formatNairaPlain(scale.baseSalary),
      String(scale.staffCount),
      formatNairaPlain(monthlyCost(scale)),
      scale.isActive ? "Active" : "Retired",
      scale.description ?? "-",
    ]),
    csvRows: rows.map((scale) => [
      scale.name,
      scale.gradeLevel ?? "",
      scale.step ?? "",
      toCsvAmount(scale.baseSalary),
      String(scale.staffCount),
      toCsvAmount(monthlyCost(scale)),
      scale.isActive ? "Active" : "Retired",
      scale.description ?? "",
    ]),
  }

  // Keyed because this array is built on the server and crosses into the client payload,
  // where React checks the elements of a list for keys.
  const tableRows: DataTableRow[] = rows.map((scale) => ({
    id: scale.id,
    href: canManage ? `${listPath}/${scale.id}` : undefined,
    search: [scale.name, scale.gradeLevel ?? "", scale.step ?? ""].join(" "),
    cells: [
      <div key="scale" className="min-w-0">
        <div className="font-medium">{scale.name}</div>
        {scale.description && <p className="truncate text-xs text-muted-foreground">{scale.description}</p>}
      </div>,
      <span key="grade" className="whitespace-nowrap text-sm">
        {[scale.gradeLevel, scale.step].filter(Boolean).join(" · ") || "—"}
      </span>,
      <span key="base" className="whitespace-nowrap tabular-nums">
        {formatNaira(scale.baseSalary)}
      </span>,
      <span key="count" className="tabular-nums">
        {scale.staffCount}
      </span>,
      <span key="cost" className="whitespace-nowrap tabular-nums">
        {scale.staffCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatNaira(monthlyCost(scale))
        )}
      </span>,
      <div key="status" className="flex flex-col gap-1">
        <Badge variant={scale.isActive ? "default" : "secondary"} className="w-fit print:hidden">
          {scale.isActive ? "Active" : "Retired"}
        </Badge>
        <span className="hidden print:block">{scale.isActive ? "Active" : "Retired"}</span>
      </div>,
    ],
  }))

  const footerCells = [
    <span key="label" className="font-semibold">
      {filtered ? "FILTERED TOTAL" : "TOTAL"}
    </span>,
    <span key="grade" />,
    <span key="base" />,
    <span key="count" className="tabular-nums">
      {onScale}
    </span>,
    <span key="cost" className="whitespace-nowrap tabular-nums">
      {formatNaira(totalCost)}
    </span>,
    <span key="status" />,
  ]

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Salary Scales" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Salary Scales</h1>
            <InfoGuide guideKey="hr.salaryScales" />
          </div>
          <p className="text-muted-foreground">
            The standard levels a salary can be based on. Assigning a scale copies its base salary onto the
            staff record, so a later change to the scale never alters anybody&apos;s pay.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandedReportExport
            title={`Salary Scales · ${scope}`}
            subtitle={scope}
            table={exportTable}
            orientation="landscape"
          />
          {canManage && (
            <Button asChild>
              <Link href={`${listPath}/new`}>New scale</Link>
            </Button>
          )}
        </div>
      </div>

      <PayComponentFilterBar
        basePath={listPath}
        filters={filters}
        searchPlaceholder="Scale, grade or step"
        showKind={false}
      />

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Scales</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{rows.length}</p>
          <p className="text-xs text-muted-foreground">
            {filtered ? `of ${all.length} in the school` : `${activeCount} active`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Staff on a scale</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{onScale}</p>
          <p className="text-xs text-muted-foreground">current assignments</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Monthly cost</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(totalCost, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">base pay, before allowances</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Nobody on it</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{unused.length}</p>
          <p className="text-xs text-muted-foreground">
            {unused.length === 0 ? "every scale is in use" : unused.map((scale) => scale.name).join(", ")}
          </p>
        </div>
      </div>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>What each scale costs</CardTitle>
          <CardDescription>
            Base pay per month, largest first — the number of people on a scale multiplied by its figure. Six
            teachers cost more than one principal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.filter((scale) => scale.staffCount > 0).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nobody is on a scale yet, so there is nothing to compare.
            </p>
          ) : (
            <SpendBarChart
              rows={[...rows]
                .filter((scale) => scale.staffCount > 0)
                .sort((a, b) => Number(monthlyCost(b)) - Number(monthlyCost(a)))
                .map((scale) => ({
                  name: scale.name,
                  amount: monthlyCost(scale),
                  budgetLimit: null,
                  overBy: null,
                }))}
              valueLabel="Monthly cost"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>Salary Scales</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "scale" : "scales"}
            {filtered ? ` of ${all.length}` : ""} · a scale somebody is on is retired rather than deleted, so
            their pay history keeps the level it was set at.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">{scope}</p>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="scales"
            searchable={false}
            footer={footerCells}
            emptyMessage={
              filtered
                ? "No scale matches these filters. Remove one of the chips above, or clear them all."
                : "No salary scales yet. Create the first level to base salaries on."
            }
          />
          {rows.length === 0 && !filtered && canManage && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${listPath}/new`}>New scale</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
