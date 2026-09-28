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
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  countActiveFilters,
  receiptFilterChips,
  receiptFilterHref,
  type ReceiptFilters,
} from "@/lib/finance/receipt-filters"
import { cn } from "@/lib/utils"

/** The local calendar day, in the form `<input type="date">` and the query string both use. */
function isoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The receipt register's filters.
 *
 * This replaced a row of buttons, one per session and term, which grew by three every
 * academic year and could only ever answer one question — which term. A bursar reconciling
 * the day's takings needs a different one: cash, taken by this cashier, on this date.
 *
 * Every filter lives in the URL rather than in component state. A filtered register can then
 * be linked to a colleague, the browser's back button walks back through the narrowing, and
 * — the reason it matters most — Print, PDF and CSV carry exactly what is on screen, because
 * the server read the same query string the table did.
 */
export function ReceiptFilterBar({
  basePath,
  filters,
  sessions,
  terms,
  cashiers,
}: {
  basePath: string
  filters: ReceiptFilters
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  terms: Array<{ id: string; name: string; sessionId: string }>
  cashiers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Partial<Record<keyof ReceiptFilters, string | undefined>>) => {
    startTransition(() => router.push(receiptFilterHref(basePath, filters, overrides)))
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

  const cashierOptions: FilterOption[] = cashiers.map((cashier) => ({ value: cashier.id, label: cashier.name }))

  const chips = receiptFilterChips(filters, { sessions, terms, cashiers })
  const active = countActiveFilters(filters)

  const today = new Date()
  const quickRanges = [
    { label: "Today", from: isoDay(today), to: isoDay(today) },
    {
      label: "Last 7 days",
      from: isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)),
      to: isoDay(today),
    },
    {
      label: "This month",
      from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: isoDay(today),
    },
  ]

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Receipt number, student name, admission number, or bank reference"
            className="sm:max-w-md"
            aria-label="Search receipts"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {active > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        {/* Four across on a laptop and two on a tablet, so the seven controls fall into tidy
            rows rather than a thin strip of them. Every control sits in the same grid so they
            share a width — the cashier select used to sit outside it and came out wider. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="filter-session"
            label="Session"
            value={filters.sessionId}
            placeholder="All sessions"
            options={sessionOptions}
            onChange={(value) => go({ sessionId: value, termId: undefined })}
          />
          <FilterSelect
            id="filter-term"
            label="Term"
            value={filters.termId}
            placeholder="All terms"
            options={termOptions}
            onChange={(value) => go({ termId: value })}
          />
          <FilterSelect
            id="filter-method"
            label="Method"
            value={filters.method}
            placeholder="Any method"
            options={[...PAYMENT_METHODS]}
            onChange={(value) => go({ method: value })}
          />
          <FilterSelect
            id="filter-status"
            label="Status"
            value={filters.status}
            placeholder="Any status"
            options={[...PAYMENT_STATUSES]}
            onChange={(value) => go({ status: value })}
          />

          {cashierOptions.length > 0 && (
            <FilterSelect
              id="filter-cashier"
              label="Received by"
              value={filters.cashierId}
              placeholder="Any cashier"
              options={cashierOptions}
              onChange={(value) => go({ cashierId: value })}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="filter-from" className="text-xs text-muted-foreground">
              Paid from
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={filters.from ?? ""}
              max={filters.to}
              onChange={(event) => go({ from: event.target.value || undefined })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-to" className="text-xs text-muted-foreground">
              Paid to
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={filters.to ?? ""}
              min={filters.from}
              onChange={(event) => go({ to: event.target.value || undefined })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick range</span>
          {quickRanges.map((range) => {
            const on = filters.from === range.from && filters.to === range.to
            return (
              <Button
                key={range.label}
                type="button"
                variant={on ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => go(on ? { from: undefined } : { from: range.from, to: range.to })}
              >
                {range.label}
              </Button>
            )
          })}
        </div>

        <FilterChips chips={chips} onRemove={(key) => go({ [key]: undefined })} />
      </CardContent>
    </Card>
  )
}
