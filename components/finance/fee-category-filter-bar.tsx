"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  FEE_STATUSES,
  FEE_TYPES,
  categoryFilterChips,
  countFeeFilters,
  feeFilterHref,
  type FeeCategoryFilters,
} from "@/lib/finance/fee-setup-filters"
import { cn } from "@/lib/utils"

/** What the categories screen is showing. Fewer questions than schedules, same rules. */
export function FeeCategoryFilterBar({
  basePath,
  filters,
}: {
  basePath: string
  filters: FeeCategoryFilters
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Record<string, string | undefined>) => {
    startTransition(() => router.push(feeFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({ search: String(form.get("search") ?? "").trim() || undefined })
  }

  return (
    <Card className={cn(pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Category name or description"
            className="sm:max-w-md"
            aria-label="Search fee categories"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countFeeFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="category-type"
            label="Type"
            value={filters.type}
            placeholder="Any type"
            options={[...FEE_TYPES]}
            onChange={(value) => go({ type: value })}
          />
          <FilterSelect
            id="category-status"
            label="Status"
            value={filters.status}
            placeholder="Any status"
            options={[...FEE_STATUSES]}
            onChange={(value) => go({ status: value })}
          />
        </div>

        <FilterChips chips={categoryFilterChips(filters)} onRemove={(key) => go({ [key]: undefined })} />
      </CardContent>
    </Card>
  )
}
