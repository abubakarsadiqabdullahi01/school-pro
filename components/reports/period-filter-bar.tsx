"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect, type FilterOption } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  countPeriodFilters,
  periodFilterChips,
  periodFilterHref,
  type PeriodFilterValues,
} from "@/lib/period-filters"
import { cn } from "@/lib/utils"

/**
 * The period a report is read over.
 *
 * Shared by the class summary, the accumulated fund and the termly expenditure report, in
 * the same shape as the receipt register's bar: every filter is a query parameter, each
 * applies as it is chosen, and what is on shows as a chip that removes itself. Print, PDF
 * and CSV then carry exactly the slice on screen, because the server read the same query
 * string the table did.
 */
export function PeriodFilterBar({
  basePath,
  filters,
  sessions,
  terms = [],
  classTerms,
  searchPlaceholder,
}: {
  basePath: string
  filters: PeriodFilterValues
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  /** Omitted where a report has no term dimension, such as the session expenditure report. */
  terms?: Array<{ id: string; name: string; sessionId: string }>
  /** Omitted where a report has no class dimension, such as the accumulated fund. */
  classTerms?: Array<{ id: string; className: string; termName: string; termId: string }>
  searchPlaceholder?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Record<string, string | undefined>) => {
    startTransition(() => router.push(periodFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({ search: String(form.get("search") ?? "").trim() || undefined })
  }

  // Picking a session narrows the terms, and a term narrows the classes. Anything left over
  // from a different period would filter to nothing, so it is cleared with what held it.
  const termsInScope = filters.sessionId ? terms.filter((term) => term.sessionId === filters.sessionId) : terms
  const classesInScope = (classTerms ?? []).filter((classTerm) =>
    filters.termId ? classTerm.termId === filters.termId : true,
  )

  const sessionOptions: FilterOption[] = sessions.map((session) => ({
    value: session.id,
    label: session.isCurrent ? `${session.name} · current` : session.name,
  }))

  const termOptions: FilterOption[] = termsInScope.map((term) => {
    const ambiguous = termsInScope.filter((other) => other.name === term.name).length > 1
    const session = sessions.find((entry) => entry.id === term.sessionId)?.name
    return { value: term.id, label: ambiguous && session ? `${term.name} · ${session}` : term.name }
  })

  const classOptions: FilterOption[] = classesInScope.map((classTerm) => ({
    value: classTerm.id,
    label: filters.termId ? classTerm.className : `${classTerm.className} · ${classTerm.termName}`,
  }))

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="period-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <Input
              id="period-search"
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder={searchPlaceholder ?? "Search this report"}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countPeriodFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            id="period-session"
            label="Session"
            value={filters.sessionId}
            placeholder="All sessions"
            options={sessionOptions}
            onChange={(value) => go({ sessionId: value, termId: undefined, classTermId: undefined })}
          />
          {terms.length > 0 && (
            <FilterSelect
              id="period-term"
              label="Term"
              value={filters.termId}
              placeholder="All terms"
              options={termOptions}
              onChange={(value) => go({ termId: value, classTermId: undefined })}
            />
          )}
          {classTerms && (
            <FilterSelect
              id="period-class"
              label="Class"
              value={filters.classTermId}
              placeholder="All classes"
              options={classOptions}
              onChange={(value) => go({ classTermId: value })}
            />
          )}
        </div>

        <FilterChips
          chips={periodFilterChips(filters, { sessions, terms, classTerms })}
          onRemove={(key) => go({ [key]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
