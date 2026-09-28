import Link from "next/link"

import { getExpenseCategories } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { ExpenseCategoryFilterBar } from "@/components/expenditure/expense-category-filter-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import type { ExportTable } from "@/components/reports/report-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import {
  budgetUsedPercent,
  countExpenseCategoryFilters,
  describeExpenseCategoryFilters,
  parseExpenseCategoryFilters,
} from "@/lib/expenditure/expense-category-filters"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"

// Six columns totalling 100%, which fit a portrait sheet: only the exported PDF is
// landscape, because it carries the description column as well.
const columns: DataTableColumn[] = [
  { label: "Category", width: "30%" },
  { label: "Termly limit", align: "right", width: "14%" },
  { label: "This term", align: "right", width: "16%" },
  { label: "Paid all time", align: "right", width: "15%" },
  { label: "Vouchers", align: "right", width: "12%" },
  { label: "Status", width: "13%" },
]

/**
 * The expense categories — what the school spends money on.
 *
 * This is the list and nothing else; adding one and changing one are their own screens. What
 * makes it worth reading is not the names, it is the termly ceiling against what this term
 * has actually spent: that is the figure the dashboard's budget watch reports, and the one
 * somebody setting next term's budget needs in front of them.
 */
export async function ExpenseCategoriesView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/categories`
  const filters = parseExpenseCategoryFilters(searchParams)

  const categories = await getExpenseCategories(filters)
  if (!categories.success) {
    return <p className="text-destructive">{categories.error}</p>
  }

  const { rows, totalCount, termName } = categories.data
  const filtered = countExpenseCategoryFilters(filters) > 0
  const scope = describeExpenseCategoryFilters(filters)

  const activeCount = rows.filter((row) => row.isActive).length
  const budgeted = rows.filter((row) => row.budgetLimit)
  const over = budgeted.filter((row) => Number(row.termSpend) > Number(row.budgetLimit))
  const termSpend = sumAmounts(rows.map((row) => row.termSpend))
  const allTime = sumAmounts(rows.map((row) => row.totalSpent))

  const exportTable: ExportTable = {
    columns: ["Category", "Description", "Termly Limit", "This Term", "Paid All Time", "Vouchers", "Status"],
    rows: rows.map((row) => [
      row.name,
      row.description ?? "-",
      row.budgetLimit ? formatNairaPlain(row.budgetLimit) : "-",
      formatNairaPlain(row.termSpend),
      formatNairaPlain(row.totalSpent),
      String(row.expenseCount),
      row.isActive ? "Active" : "Retired",
    ]),
    csvRows: rows.map((row) => [
      row.name,
      row.description ?? "",
      row.budgetLimit ? toCsvAmount(row.budgetLimit) : "",
      toCsvAmount(row.termSpend),
      toCsvAmount(row.totalSpent),
      String(row.expenseCount),
      row.isActive ? "Active" : "Retired",
    ]),
  }

  const tableRows: DataTableRow[] = rows.map((row) => {
    const percent = budgetUsedPercent(row.budgetLimit, row.termSpend)
    const isOver = percent !== null && percent > 100

    // Keyed because this array is built on the server and crosses into the client payload,
    // where React checks the elements of a list for keys.
    return {
      id: row.id,
      href: `${listPath}/${row.id}`,
      search: [row.name, row.description ?? ""].join(" "),
      cells: [
        <div key="category" className="min-w-0">
          <div className="font-medium">{row.name}</div>
          {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
        </div>,
        <span key="limit" className="whitespace-nowrap tabular-nums">
          {row.budgetLimit ? formatNaira(row.budgetLimit) : <span className="text-muted-foreground">—</span>}
        </span>,
        <div key="term" className="whitespace-nowrap">
          <span className={`tabular-nums ${isOver ? "font-semibold text-destructive" : ""}`}>
            {formatNaira(row.termSpend)}
          </span>
          {percent !== null && (
            <p className={`text-xs ${isOver ? "text-destructive" : "text-muted-foreground"}`}>
              {percent}% of limit
            </p>
          )}
        </div>,
        <span key="all" className="whitespace-nowrap tabular-nums">
          {formatNaira(row.totalSpent)}
        </span>,
        <div key="vouchers" className="whitespace-nowrap">
          <span className="tabular-nums">{row.expenseCount}</span>
          {row.unpaidExpenseCount > 0 && (
            <p className="text-xs text-muted-foreground">{row.unpaidExpenseCount} to pay</p>
          )}
        </div>,
        <div key="status" className="flex flex-col gap-1">
          <Badge variant={row.isActive ? "default" : "secondary"} className="w-fit print:hidden">
            {row.isActive ? "Active" : "Retired"}
          </Badge>
          <span className="hidden print:block">{row.isActive ? "Active" : "Retired"}</span>
        </div>,
      ],
    }
  })

  const footerCells = [
    <span key="label" className="font-semibold">
      {filtered ? "FILTERED TOTAL" : "TOTAL"}
    </span>,
    <span key="limit" className="whitespace-nowrap tabular-nums">
      {formatNaira(sumAmounts(budgeted.map((row) => row.budgetLimit ?? 0)))}
    </span>,
    <span key="term" className="whitespace-nowrap tabular-nums">
      {formatNaira(termSpend)}
    </span>,
    <span key="all" className="whitespace-nowrap tabular-nums">
      {formatNaira(allTime)}
    </span>,
    <span key="vouchers" className="tabular-nums">
      {rows.reduce((total, row) => total + row.expenseCount, 0)}
    </span>,
    <span key="status" />,
  ]

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Expense Categories" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Expense Categories</h1>
            <InfoGuide guideKey="expenditure.categories" />
          </div>
          <p className="text-muted-foreground">
            What the school spends money on, and the optional termly budget each is reported against. Open
            one to rename it, move its ceiling, retire it or see what has been charged to it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandedReportExport
            title={`Expense Categories · ${scope}`}
            subtitle={scope}
            table={exportTable}
            orientation="landscape"
          />
          <Button asChild>
            <Link href={`${listPath}/new`}>New category</Link>
          </Button>
        </div>
      </div>

      <ExpenseCategoryFilterBar basePath={listPath} filters={filters} />

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Categories</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{rows.length}</p>
          <p className="text-xs text-muted-foreground">
            {filtered ? `of ${totalCount} in the school` : `${activeCount} active`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Spent {termName ? `in ${termName}` : "this term"}</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(termSpend, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">paid vouchers only</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Budgeted</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{budgeted.length}</p>
          <p className="text-xs text-muted-foreground">
            {budgeted.length === 0
              ? "no ceilings set"
              : `${formatNaira(
                  sumAmounts(budgeted.map((row) => row.budgetLimit ?? 0)),
                  { kobo: false },
                )} a term`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Over budget</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              over.length > 0 ? "text-destructive" : ""
            }`}
          >
            {over.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {over.length === 0 ? "every ceiling is holding" : over.map((row) => row.name).join(", ")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "category" : "categories"}
            {filtered ? ` of ${totalCount}` : ""} · a limit is reported against, never enforced, and a
            category in use is retired rather than deleted so past vouchers keep their labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">{scope}</p>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="categories"
            searchable={false}
            footer={footerCells}
            emptyMessage={
              filtered
                ? "No category matches these filters. Remove one of the chips above, or clear them all."
                : "No expense categories yet. Create the first one to start recording spending."
            }
          />
          {rows.length === 0 && !filtered && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${listPath}/new`}>New category</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
