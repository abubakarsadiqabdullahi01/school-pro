"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect, type FilterOption } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  FEE_AUDIENCES,
  FEE_SCOPES,
  FEE_STATUSES,
  countFeeFilters,
  feeFilterHref,
  scheduleFilterChips,
  type FeeScheduleFilters,
} from "@/lib/finance/fee-setup-filters"
import { cn } from "@/lib/utils"

/**
 * What the schedules screen is showing.
 *
 * A school running three terms across two sessions carries a schedule per category per term
 * per class, so the question is never "show me everything" — it is "what bills SSS 3A this
 * term", or "what is still active from last session". Each filter is a query parameter, so a
 * narrowed list can be linked to, walked back out of, and reloaded as it was left.
 */
export function FeeScheduleFilterBar({
  basePath,
  filters,
  sessions,
  terms,
  categories,
}: {
  basePath: string
  filters: FeeScheduleFilters
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string }>
  categories: Array<{ id: string; name: string }>
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

  // Picking a session narrows the terms on offer; a term left over from the other session
  // would filter to nothing, so it is cleared along with the session that held it.
  const termsInScope = filters.sessionId ? terms.filter((term) => term.sessionId === filters.sessionId) : terms

  const termOptions: FilterOption[] = termsInScope.map((term) => {
    // "Third Term" exists once per session, so the name alone would offer two identical
    // options. The session is added only where the name is actually ambiguous.
    const ambiguous = termsInScope.filter((other) => other.name === term.name).length > 1
    const session = sessions.find((entry) => entry.id === term.sessionId)?.name
    return { value: term.id, label: ambiguous && session ? `${term.name} · ${session}` : term.name }
  })

  const sessionOptions: FilterOption[] = sessions.map((session) => ({
    value: session.id,
    label: session.isCurrent ? `${session.name} · current` : session.name,
  }))

  const categoryOptions: FilterOption[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }))

  const chips = scheduleFilterChips(filters, { sessions, terms, categories })

  return (
    <Card className={cn(pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Fee name, description, category or class"
            className="sm:max-w-md"
            aria-label="Search fee schedules"
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            id="schedule-session"
            label="Session"
            value={filters.sessionId}
            placeholder="All sessions"
            options={sessionOptions}
            onChange={(value) => go({ sessionId: value, termId: undefined })}
          />
          <FilterSelect
            id="schedule-term"
            label="Term"
            value={filters.termId}
            placeholder="All terms"
            options={termOptions}
            onChange={(value) => go({ termId: value })}
          />
          <FilterSelect
            id="schedule-category"
            label="Category"
            value={filters.categoryId}
            placeholder="All categories"
            options={categoryOptions}
            onChange={(value) => go({ categoryId: value })}
          />
          <FilterSelect
            id="schedule-scope"
            label="Scope"
            value={filters.scope}
            placeholder="Any scope"
            options={[...FEE_SCOPES]}
            onChange={(value) => go({ scope: value })}
          />
          <FilterSelect
            id="schedule-audience"
            label="Applies to"
            value={filters.audience}
            placeholder="Anyone"
            options={[...FEE_AUDIENCES]}
            onChange={(value) => go({ audience: value })}
          />
          <FilterSelect
            id="schedule-status"
            label="Status"
            value={filters.status}
            placeholder="Any status"
            options={[...FEE_STATUSES]}
            onChange={(value) => go({ status: value })}
          />
        </div>

        <FilterChips chips={chips} onRemove={(key) => go({ [key]: undefined })} />
      </CardContent>
    </Card>
  )
}
