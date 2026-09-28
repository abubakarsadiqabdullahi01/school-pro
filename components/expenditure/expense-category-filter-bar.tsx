"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  EXPENSE_CATEGORY_BUDGETS,
  EXPENSE_CATEGORY_STATUSES,
  EXPENSE_CATEGORY_USAGE,
  countExpenseCategoryFilters,
  expenseCategoryChips,
  expenseCategoryFilterHref,
  type ExpenseCategoryFilters,
} from "@/lib/expenditure/expense-category-filters"
import { cn } from "@/lib/utils"

/** What the categories screen is showing. Same bar as the payment chart, fewer questions. */
export function ExpenseCategoryFilterBar({
  basePath,
  filters,
}: {
  basePath: string
  filters: ExpenseCategoryFilters
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Partial<Record<keyof ExpenseCategoryFilters, string | undefined>>) => {
    startTransition(() => router.push(expenseCategoryFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({ search: String(form.get("search") ?? "").trim() || undefined })
  }

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Category name or description"
            className="sm:max-w-md"
            aria-label="Search expense categories"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countExpenseCategoryFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            id="category-status"
            label="Status"
            value={filters.status}
            placeholder="Active and retired"
            options={[...EXPENSE_CATEGORY_STATUSES]}
            onChange={(value) => go({ status: value })}
          />
          <FilterSelect
            id="category-budget"
            label="Budget"
            value={filters.budget}
            placeholder="Any budget"
            options={[...EXPENSE_CATEGORY_BUDGETS]}
            onChange={(value) => go({ budget: value })}
          />
          <FilterSelect
            id="category-usage"
            label="Use"
            value={filters.usage}
            placeholder="Used or not"
            options={[...EXPENSE_CATEGORY_USAGE]}
            onChange={(value) => go({ usage: value })}
          />
        </div>

        <FilterChips
          chips={expenseCategoryChips(filters)}
          onRemove={(key) => go({ [key as keyof ExpenseCategoryFilters]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
