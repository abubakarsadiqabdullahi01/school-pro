"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FilterX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * The transaction-list filters.
 *
 * State lives in the URL rather than this component, so a filtered view can be bookmarked,
 * sent to the admin who asked for it, and survives the refresh that follows approving or
 * paying something from the list.
 *
 * Radix reserves the empty string, so "any" travels as an ANY sentinel and is dropped when
 * the query string is built.
 */
const ANY = "ANY"

export type ExpenditureFilterValues = {
  sessionId?: string
  termId?: string
  categoryId?: string
  accountId?: string
  status?: string
  payee?: string
  from?: string
  to?: string
  minAmount?: string
  maxAmount?: string
}

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Awaiting approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
]

export function ExpenditureFilter({
  basePath,
  sessions,
  terms,
  categories,
  accounts,
  values,
}: {
  basePath: string
  sessions: Array<{ id: string; name: string }>
  terms: Array<{ id: string; name: string; sessionId: string }>
  categories: Array<{ id: string; name: string }>
  accounts: Array<{ id: string; name: string }>
  values: ExpenditureFilterValues
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<ExpenditureFilterValues>(values)

  // Terms narrow to the chosen session. A list spanning every year is unusable once a
  // school has a few sessions of history.
  const visibleTerms = draft.sessionId ? terms.filter((term) => term.sessionId === draft.sessionId) : terms

  function set(key: keyof ExpenditureFilterValues, raw: string) {
    const value = raw === ANY ? undefined : raw
    setDraft((previous) => {
      const next = { ...previous, [key]: value }
      // Changing the session can orphan a term chosen underneath it.
      if (key === "sessionId") next.termId = undefined
      return next
    })
  }

  function apply() {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(draft)) {
      if (value) params.set(key, value)
    }
    const query = params.toString()
    router.push(query ? `${basePath}?${query}` : basePath)
  }

  function reset() {
    setDraft({})
    router.push(basePath)
  }

  return (
    <Card className="print:hidden">
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Session">
            <Select value={draft.sessionId ?? ANY} onValueChange={(value) => set("sessionId", value)}>
              <SelectTrigger><SelectValue placeholder="Any session" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any session</SelectItem>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Term">
            <Select value={draft.termId ?? ANY} onValueChange={(value) => set("termId", value)}>
              <SelectTrigger><SelectValue placeholder="Any term" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any term</SelectItem>
                {visibleTerms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Category">
            <Select value={draft.categoryId ?? ANY} onValueChange={(value) => set("categoryId", value)}>
              <SelectTrigger><SelectValue placeholder="Any category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Paid from">
            <Select value={draft.accountId ?? ANY} onValueChange={(value) => set("accountId", value)}>
              <SelectTrigger><SelectValue placeholder="Any account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any account</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Status">
            <Select value={draft.status ?? ANY} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any status</SelectItem>
                {STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payee contains">
            <Input
              value={draft.payee ?? ""}
              onChange={(event) => set("payee", event.target.value)}
              placeholder="Any payee"
            />
          </Field>

          <Field label="From date">
            <Input type="date" value={draft.from ?? ""} onChange={(event) => set("from", event.target.value)} />
          </Field>

          <Field label="To date">
            <Input type="date" value={draft.to ?? ""} onChange={(event) => set("to", event.target.value)} />
          </Field>

          <Field label="Amount at least">
            <Input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={draft.minAmount ?? ""}
              onChange={(event) => set("minAmount", event.target.value)}
              placeholder="Any"
            />
          </Field>

          <Field label="Amount at most">
            <Input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={draft.maxAmount ?? ""}
              onChange={(event) => set("maxAmount", event.target.value)}
              placeholder="Any"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={apply}>Apply Filters</Button>
          <Button type="button" size="sm" variant="outline" onClick={reset}>
            <FilterX className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
