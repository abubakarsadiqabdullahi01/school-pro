"use client"

import { useMemo, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { filterRows, isOnPage, pageWindow } from "@/lib/table"
import { cn } from "@/lib/utils"

/**
 * A report table with a search box and pagination.
 *
 * Every list in finance, expenditure and HR used to render a bare `<table>` of every row it
 * had, which is fine for the four classes in a demo school and unusable for a real one — the
 * register of receipts alone runs to hundreds of rows and pushed the page furniture off the
 * bottom of the screen.
 *
 * Cells arrive as finished nodes rather than raw data. The server view already formats money
 * through the Decimal helpers and builds the row's links, so this component stays generic and
 * never needs to know what it is showing. `search` is the flat text the box matches on, which
 * the view supplies because only it knows which columns are worth searching.
 *
 * Printing is deliberately not paginated: pagination is a screen convenience, so the printed
 * page carries every row that survives the search. Searching therefore narrows the report —
 * which is what somebody printing a filtered list expects — while paging never does.
 */
export type DataTableColumn = {
  label: string
  align?: "left" | "right" | "center"
  /** Dropped from the printed page. Action buttons, mostly. */
  printHidden?: boolean
  className?: string
}

export type DataTableRow = {
  id: string
  /** Flat text the search box matches against. */
  search: string
  cells: ReactNode[]
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

export function DataTable({
  columns,
  rows,
  pageSize = 12,
  searchPlaceholder = "Search this table",
  emptyMessage = "Nothing to show yet.",
  noMatchMessage = "No rows match your search.",
  unit = "rows",
  footer,
}: {
  columns: DataTableColumn[]
  rows: DataTableRow[]
  pageSize?: number
  searchPlaceholder?: string
  /** Shown when the table has no rows at all. */
  emptyMessage?: string
  /** Shown when the table has rows but the search excludes all of them. */
  noMatchMessage?: string
  /** Named in the row count, e.g. "receipts", "staff". */
  unit?: string
  /** A totals row, exempt from both the search and the paging. */
  footer?: ReactNode[]
}) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => filterRows(rows, search), [rows, search])
  const window = pageWindow(filtered.length, page, pageSize)
  const { page: safePage, totalPages, firstIndex, lastIndex } = window

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          placeholder={searchPlaceholder}
          className="sm:max-w-sm"
          aria-label={searchPlaceholder}
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length === 0
            ? `No ${unit}`
            : `Showing ${firstIndex + 1}-${lastIndex} of ${filtered.length} ${unit}`}
          {search && rows.length !== filtered.length ? ` (filtered from ${rows.length})` : ""}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              {columns.map((column) => (
                <th
                  key={column.label}
                  className={cn(
                    "py-2 pr-4 font-medium",
                    alignClass[column.align ?? "left"],
                    column.printHidden && "print:hidden",
                    column.className,
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => {
              const onPage = isOnPage(index, window)
              return (
                <tr
                  key={row.id}
                  // Off-page rows stay in the DOM so the printed report is complete.
                  className={cn("border-b last:border-0", onPage ? "" : "hidden print:table-row")}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={columns[cellIndex]?.label ?? cellIndex}
                      className={cn(
                        "py-3 pr-4",
                        alignClass[columns[cellIndex]?.align ?? "left"],
                        columns[cellIndex]?.printHidden && "print:hidden",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {footer && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                {footer.map((cell, cellIndex) => (
                  <td
                    key={columns[cellIndex]?.label ?? cellIndex}
                    className={cn(
                      "py-3 pr-4",
                      alignClass[columns[cellIndex]?.align ?? "left"],
                      columns[cellIndex]?.printHidden && "print:hidden",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? emptyMessage : noMatchMessage}
        </p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
