import Link from "next/link"

import { getFeeCategories } from "@/app/actions/finance"
import { FeeCategoryFilterBar } from "@/components/finance/fee-category-filter-bar"
import { FeeSetupNav } from "@/components/finance/fee-setup-nav"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FEE_TYPES, countFeeFilters, parseCategoryFilters } from "@/lib/finance/fee-setup-filters"
import { formatDocumentDate } from "@/lib/format"

const columns: DataTableColumn[] = [
  { label: "Category", width: "34%" },
  { label: "Type", width: "16%" },
  { label: "Schedules", align: "right", width: "14%" },
  { label: "Status", width: "16%" },
  { label: "Created", width: "20%" },
]

const typeLabel = (value: string) => FEE_TYPES.find((option) => option.value === value)?.label ?? value

/**
 * The fee categories — the headings everything else is grouped and reported under.
 *
 * The schedule count is what makes the list worth reading: a category with nothing billing
 * against it is either new or forgotten, and one with active schedules is load-bearing.
 */
export async function FeeCategoriesView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/fees/categories`
  const filters = parseCategoryFilters(searchParams)

  const categories = await getFeeCategories(filters)
  if (!categories.success) {
    return <p className="text-destructive">{categories.error}</p>
  }

  const { rows, totalCount } = categories.data
  const filtered = countFeeFilters(filters) > 0
  const activeCount = rows.filter((row) => row.isActive).length

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: `${basePath}/fees/categories/${row.id}/edit`,
    search: [row.name, row.description ?? "", row.type].join(" "),
    // Keyed because this array is built on the server and crosses into the client payload,
    // where React checks the elements in a list for keys.
    cells: [
      <div key="category" className="min-w-0">
        <div className="font-medium">{row.name}</div>
        {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
      </div>,
      <span key="type" className="whitespace-nowrap">
        {typeLabel(row.type)}
      </span>,
      <span key="schedules" className="whitespace-nowrap tabular-nums">
        {row.scheduleCount}
        {row.scheduleCount > 0 && row.activeScheduleCount !== row.scheduleCount && (
          <span className="text-muted-foreground"> ({row.activeScheduleCount} active)</span>
        )}
      </span>,
      <Badge key="status" variant={row.isActive ? "default" : "secondary"}>
        {row.isActive ? "Active" : "Inactive"}
      </Badge>,
      <span key="created" className="whitespace-nowrap text-muted-foreground">
        {formatDocumentDate(row.createdAt)}
      </span>,
    ],
  }))

  return (
    <div className="space-y-6">
      <FeeSetupNav basePath={basePath} active="categories" />

      <FeeCategoryFilterBar basePath={listPath} filters={filters} />

      <Card>
        <CardHeader>
          <CardTitle>Fee Categories</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "category" : "categories"}
            {filtered ? ` of ${totalCount}` : ""} · {activeCount} active
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="categories"
            searchable={false}
            emptyMessage={
              filtered
                ? "No category matches these filters. Remove one of the chips above, or clear them all."
                : "No fee categories yet. Create the first one to start billing."
            }
          />
          {rows.length === 0 && !filtered && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${basePath}/fees/categories/new`}>New fee category</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
