"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  COMPONENT_KINDS,
  COMPONENT_STATUSES,
  COMPONENT_USAGE,
  DEDUCTION_TIMINGS,
  countPayComponentFilters,
  payComponentChips,
  payComponentFilterHref,
  type PayComponentFilters,
} from "@/lib/hr/pay-component-filters"
import { cn } from "@/lib/utils"

/**
 * What one of the three pay-setup lists is showing.
 *
 * One bar for salary scales, allowances and deductions, because the questions are the same.
 * `showKind` is off for scales — a scale is always a naira figure — and `showTiming` is on
 * only for deductions, where before or after tax changes the arithmetic.
 */
export function PayComponentFilterBar({
  basePath,
  filters,
  searchPlaceholder,
  showKind = true,
  showTiming = false,
}: {
  basePath: string
  filters: PayComponentFilters
  searchPlaceholder: string
  showKind?: boolean
  showTiming?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Partial<Record<keyof PayComponentFilters, string | undefined>>) => {
    startTransition(() => router.push(payComponentFilterHref(basePath, filters, overrides)))
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
            placeholder={searchPlaceholder}
            className="sm:max-w-md"
            aria-label={searchPlaceholder}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countPayComponentFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="component-status"
            label="Status"
            value={filters.status}
            placeholder="Active and retired"
            options={[...COMPONENT_STATUSES]}
            onChange={(value) => go({ status: value })}
          />
          {showKind && (
            <FilterSelect
              id="component-kind"
              label="Type"
              value={filters.kind}
              placeholder="Any type"
              options={[...COMPONENT_KINDS]}
              onChange={(value) => go({ kind: value })}
            />
          )}
          {showTiming && (
            <FilterSelect
              id="component-timing"
              label="Applies"
              value={filters.timing}
              placeholder="Before or after tax"
              options={[...DEDUCTION_TIMINGS]}
              onChange={(value) => go({ timing: value })}
            />
          )}
          <FilterSelect
            id="component-usage"
            label="Use"
            value={filters.usage}
            placeholder="In use or not"
            options={[...COMPONENT_USAGE]}
            onChange={(value) => go({ usage: value })}
          />
        </div>

        <FilterChips
          chips={payComponentChips(filters)}
          onRemove={(key) => go({ [key as keyof PayComponentFilters]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
