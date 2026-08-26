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
 * The debtor chase-list filters.
 *
 * State lives in the URL rather than in this component, so a filtered list can be
 * bookmarked, shared with the admin who asked for it, and survives the refresh that
 * follows recording a payment from the list.
 *
 * Radix reserves the empty string as "no value", so "any" is carried by an ANY sentinel and
 * dropped when the query string is built.
 */
const ANY = "ANY"

export type DebtorsFilterValues = {
  sessionId?: string
  termId?: string
  classTermId?: string
  minBalance?: string
  paymentStatus?: string
  studentType?: string
}

export function DebtorsFilter({
  basePath,
  sessions,
  terms,
  classTerms,
  values,
}: {
  basePath: string
  sessions: Array<{ id: string; name: string }>
  terms: Array<{ id: string; name: string; sessionId: string }>
  classTerms: Array<{ id: string; className: string; termName: string; termId: string }>
  values: DebtorsFilterValues
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<DebtorsFilterValues>(values)

  // Terms and classes are shown only for the chosen session/term. A class list spanning
  // every term of every session is unusable once a school has a few years of history.
  const visibleTerms = draft.sessionId ? terms.filter((term) => term.sessionId === draft.sessionId) : terms
  const visibleClassTerms = draft.termId
    ? classTerms.filter((classTerm) => classTerm.termId === draft.termId)
    : classTerms.filter((classTerm) => visibleTerms.some((term) => term.id === classTerm.termId))

  function set(key: keyof DebtorsFilterValues, raw: string) {
    const value = raw === ANY ? undefined : raw
    setDraft((previous) => {
      const next = { ...previous, [key]: value }
      // Narrowing the session or term can orphan a selection made below it.
      if (key === "sessionId") {
        next.termId = undefined
        next.classTermId = undefined
      }
      if (key === "termId") next.classTermId = undefined
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

          <Field label="Class">
            <Select value={draft.classTermId ?? ANY} onValueChange={(value) => set("classTermId", value)}>
              <SelectTrigger><SelectValue placeholder="Any class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any class</SelectItem>
                {visibleClassTerms.map((classTerm) => (
                  <SelectItem key={classTerm.id} value={classTerm.id}>
                    {classTerm.className} · {classTerm.termName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payment status">
            <Select value={draft.paymentStatus ?? ANY} onValueChange={(value) => set("paymentStatus", value)}>
              <SelectTrigger><SelectValue placeholder="Any status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any status</SelectItem>
                <SelectItem value="UNPAID">Nothing paid</SelectItem>
                <SelectItem value="PARTIAL">Part paid</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Student type">
            <Select value={draft.studentType ?? ANY} onValueChange={(value) => set("studentType", value)}>
              <SelectTrigger><SelectValue placeholder="All students" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All students</SelectItem>
                <SelectItem value="NEW_STUDENTS">New students</SelectItem>
                <SelectItem value="RETURNING_STUDENTS">Returning students</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Owes at least">
            <Input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              placeholder="Any amount"
              value={draft.minBalance ?? ""}
              onChange={(event) => set("minBalance", event.target.value)}
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
