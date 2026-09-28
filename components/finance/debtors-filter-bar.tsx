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
  PAYMENT_STATES,
  STUDENT_TYPES,
  countDebtorFilters,
  debtorFilterChips,
  debtorFilterHref,
  type DebtorFilterValues,
} from "@/lib/finance/debtor-filters"
import { cn } from "@/lib/utils"

/**
 * The debtor chase-list's filters.
 *
 * Same shape as the receipt register's: every filter is a query parameter, each one applies
 * as it is chosen rather than waiting for an Apply button, and what is on shows as a chip
 * that removes itself. That matters more here than anywhere — the list is worked through
 * with a phone in one hand, and Print, PDF and CSV carry exactly the slice on screen.
 */
export function DebtorsFilterBar({
  basePath,
  filters,
  sessions,
  terms,
  classTerms,
}: {
  basePath: string
  filters: DebtorFilterValues
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string }>
  classTerms: Array<{ id: string; className: string; termName: string; termId: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Record<string, string | undefined>) => {
    startTransition(() => router.push(debtorFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({
      search: String(form.get("search") ?? "").trim() || undefined,
      minBalance: String(form.get("minBalance") ?? "").trim() || undefined,
    })
  }

  // Picking a session narrows the terms, and a term narrows the classes. A class left over
  // from another term would filter to nobody, so it is cleared with what held it.
  const termsInScope = filters.sessionId ? terms.filter((term) => term.sessionId === filters.sessionId) : terms
  const classesInScope = filters.termId
    ? classTerms.filter((classTerm) => classTerm.termId === filters.termId)
    : classTerms

  const termOptions: FilterOption[] = termsInScope.map((term) => {
    const ambiguous = termsInScope.filter((other) => other.name === term.name).length > 1
    const session = sessions.find((entry) => entry.id === term.sessionId)?.name
    return { value: term.id, label: ambiguous && session ? `${term.name} · ${session}` : term.name }
  })

  const sessionOptions: FilterOption[] = sessions.map((session) => ({
    value: session.id,
    label: session.isCurrent ? `${session.name} · current` : session.name,
  }))

  const classOptions: FilterOption[] = classesInScope.map((classTerm) => ({
    value: classTerm.id,
    label: filters.termId ? classTerm.className : `${classTerm.className} · ${classTerm.termName}`,
  }))

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="debtor-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <Input
              id="debtor-search"
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder="Student, admission number, class or parent contact"
            />
          </div>
          <div className="space-y-1.5 sm:w-48">
            <Label htmlFor="debtor-min" className="text-xs text-muted-foreground">
              Owes at least (₦)
            </Label>
            <Input
              id="debtor-min"
              name="minBalance"
              type="number"
              min="0"
              step="100"
              defaultValue={filters.minBalance ?? ""}
              placeholder="Any amount"
              className="tabular-nums"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            {countDebtorFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <FilterSelect
            id="debtor-session"
            label="Session"
            value={filters.sessionId}
            placeholder="All sessions"
            options={sessionOptions}
            onChange={(value) => go({ sessionId: value, termId: undefined, classTermId: undefined })}
          />
          <FilterSelect
            id="debtor-term"
            label="Term"
            value={filters.termId}
            placeholder="All terms"
            options={termOptions}
            onChange={(value) => go({ termId: value, classTermId: undefined })}
          />
          <FilterSelect
            id="debtor-class"
            label="Class"
            value={filters.classTermId}
            placeholder="All classes"
            options={classOptions}
            onChange={(value) => go({ classTermId: value })}
          />
          <FilterSelect
            id="debtor-status"
            label="Payment status"
            value={filters.paymentStatus}
            placeholder="Any status"
            options={[...PAYMENT_STATES]}
            onChange={(value) => go({ paymentStatus: value })}
          />
          <FilterSelect
            id="debtor-type"
            label="Student type"
            value={filters.studentType}
            placeholder="All students"
            options={[...STUDENT_TYPES]}
            onChange={(value) => go({ studentType: value })}
          />
        </div>

        <FilterChips
          chips={debtorFilterChips(filters, { sessions, terms, classTerms })}
          onRemove={(key) => go({ [key]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
