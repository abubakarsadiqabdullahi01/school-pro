"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  applyChargeDiscount,
  applyChargeExemption,
  getStudentStatement,
  searchFinanceStudents,
} from "@/app/actions/finance"
import { StudentSearchResults, type FinanceStudentSearchRow } from "@/components/finance/student-search-results"
import { FilterSelect } from "@/components/reports/filter-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { checkAdjustment } from "@/lib/finance/adjustment-rules"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

type Mode = "discount" | "exemption"

type Charge = {
  id: string
  description: string
  originalAmount: string
  categoryName: string | null
  termName: string | null
  amount: string
  paid: string
  balance: string
  status: string
  dueDate: string | null
}

type Statement = {
  student: {
    id: string
    admissionNo: string
    name: string
    currentClass: string | null
    currentTerm: string | null
  }
  totals: { charged: string; paid: string; discounts: string; exemptions: string; balance: string }
  charges: Charge[]
}

type ClassOption = { id: string; className: string; termName: string; termId: string }

/**
 * Taking money off a fee — a discount, or an exemption.
 *
 * Both are money the school will never chase, so the screen's job is to make the decision
 * visible before it is recorded: which child, which fee, what it costs, and what is left
 * afterwards. The charge used to be a bare dropdown and the amount a number with nothing to
 * check it against, so an approval was signed off without the figure it produced ever being
 * shown. Now the fee is picked from cards that carry their own balance, and the effect is
 * spelled out under the amount before the button will submit.
 */
export function FinanceAdjustmentForm({
  mode,
  basePath,
  classes,
}: {
  mode: Mode
  basePath: string
  /** The classes of the current session, for narrowing the search. */
  classes: ClassOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [query, setQuery] = useState("")
  const [classTermId, setClassTermId] = useState<string | undefined>(undefined)
  const [owingOnly, setOwingOnly] = useState(true)
  const [students, setStudents] = useState<FinanceStudentSearchRow[]>([])

  const [statement, setStatement] = useState<Statement | null>(null)
  const [chargeId, setChargeId] = useState("")
  const [type, setType] = useState<"FIXED" | "PERCENTAGE">("FIXED")
  const [value, setValue] = useState("")

  const noun = mode === "discount" ? "Discount" : "Exemption"
  const action = mode === "discount" ? applyChargeDiscount : applyChargeExemption

  const openCharges = useMemo(
    () => statement?.charges.filter((charge) => Number(charge.balance) > 0) ?? [],
    [statement],
  )
  const charge = openCharges.find((row) => row.id === chargeId)

  // The same arithmetic the server runs, so the figure on screen is the figure that will be
  // written — and the refusal arrives before the click rather than after it.
  const verdict = charge
    ? checkAdjustment(
        type,
        Number(value) || 0,
        {
          originalAmount: Number(charge.originalAmount),
          finalAmountDue: Number(charge.amount),
          amountPaid: Number(charge.paid),
        },
        formatNaira,
      )
    : null

  const search = useCallback(() => {
    startTransition(async () => {
      const result = await searchFinanceStudents({ query, classTermId, owingOnly })
      if (result.success) setStudents(result.data)
      else toast.error("Search failed", { description: result.error })
    })
  }, [query, classTermId, owingOnly])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      search()
    }, 300)

    return () => window.clearTimeout(handle)
  }, [search])

  const loadStudent = useCallback((studentId: string) => {
    startTransition(async () => {
      const result = await getStudentStatement(studentId)
      if (!result.success) {
        toast.error("Statement failed", { description: result.error })
        return
      }

      setStatement(result.data)
      const open = result.data.charges.filter((row) => Number(row.balance) > 0)
      setChargeId(open[0]?.id ?? "")
      setValue("")
    })
  }, [])

  function submit(formData: FormData) {
    if (!statement || !charge || !verdict?.allowed) return

    startTransition(async () => {
      const result = await action({
        studentId: statement.student.id,
        chargeId: charge.id,
        type,
        value: Number(value) || 0,
        reason: String(formData.get("reason") ?? ""),
      })

      if (!result.success) {
        toast.error(`${noun} not applied`, { description: result.error })
        return
      }

      toast.success(`${noun} applied`, {
        description: `${formatNaira(result.data.amountApplied)} off ${charge.description} for ${statement.student.name}.`,
      })
      loadStudent(statement.student.id)
      // The recorded list below is server-rendered, so it needs the page refreshed to show
      // what was just granted.
      router.refresh()
    })
  }

  const classOptions = classes.map((option) => ({
    value: option.id,
    label: `${option.className} · ${option.termName}`,
  }))

  const givenAway = Number(statement?.totals.discounts ?? 0) + Number(statement?.totals.exemptions ?? 0)

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Find Student</CardTitle>
          <CardDescription>Search by name or admission number, or narrow by class.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Student name or admission no"
            aria-label="Search students"
          />

          <FilterSelect
            id="adjustment-class"
            label="Class"
            value={classTermId}
            placeholder="Any class"
            options={classOptions}
            onChange={setClassTermId}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={owingOnly}
              onChange={(event) => setOwingOnly(event.target.checked)}
            />
            Only students who owe something
          </label>

          <p className="text-xs text-muted-foreground">
            An adjustment can only come off a fee that is still owing, so the list starts there.
          </p>
          <StudentSearchResults students={students} onSelect={(student) => loadStudent(student.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{statement ? statement.student.name : `Apply ${noun}`}</CardTitle>
          <CardDescription>
            {statement
              ? `${statement.student.admissionNo} · ${statement.student.currentClass ?? "No class"} · ${
                  statement.student.currentTerm ?? "No term"
                }`
              : "Select a student with an unpaid charge."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!statement ? (
            <p className="text-sm text-muted-foreground">No student selected.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Billed</p>
                  <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.charged)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.paid)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Already given</p>
                  <p className="text-lg font-semibold tabular-nums">{formatNaira(givenAway)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.balance)}</p>
                </div>
              </div>

              {openCharges.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Nothing is outstanding for this student, so there is nothing to adjust.
                </p>
              ) : (
                <form action={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Which fee</Label>
                    <div className="space-y-2">
                      {openCharges.map((row) => (
                        <label
                          key={row.id}
                          className={
                            row.id === chargeId
                              ? "flex cursor-pointer items-start gap-3 rounded-md border border-primary/60 bg-muted/40 p-3"
                              : "flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                          }
                        >
                          <input
                            type="radio"
                            name="chargeId"
                            className="mt-1 size-4"
                            checked={row.id === chargeId}
                            onChange={() => {
                              setChargeId(row.id)
                              setValue("")
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{row.description}</span>
                              {row.status === "PARTIAL" && <Badge variant="secondary">Part paid</Badge>}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {[row.categoryName, row.termName].filter(Boolean).join(" · ")}
                              {row.dueDate ? ` · due ${formatDocumentDate(row.dueDate)}` : ""}
                            </span>
                            <span className="block text-sm tabular-nums text-muted-foreground">
                              Paid {formatNaira(row.paid)} of {formatNaira(row.amount)} ·{" "}
                              <span className="font-medium text-foreground">{formatNaira(row.balance)} owing</span>
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-type">Type</Label>
                      <Select value={type} onValueChange={(next) => setType(next as "FIXED" | "PERCENTAGE")}>
                        <SelectTrigger id="adjustment-type">
                          <SelectValue>{type === "PERCENTAGE" ? "Percentage" : "Fixed amount"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIXED">Fixed amount</SelectItem>
                          <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {type === "PERCENTAGE"
                          ? "A share of what the fee was, not of what is left."
                          : "The naira written on the approval."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adjustment-value">{type === "PERCENTAGE" ? "Percentage" : "Amount (₦)"}</Label>
                      <Input
                        id="adjustment-value"
                        type="number"
                        min="0"
                        step={type === "PERCENTAGE" ? "1" : "0.01"}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={type === "PERCENTAGE" ? "25" : "5000"}
                        className="tabular-nums"
                        aria-invalid={Boolean(verdict && !verdict.allowed && value !== "")}
                        required
                      />
                      {charge && value !== "" && verdict && (
                        <p
                          className={
                            verdict.allowed
                              ? "text-xs text-muted-foreground"
                              : "text-xs text-destructive"
                          }
                        >
                          {verdict.allowed
                            ? `${formatNaira(verdict.amount)} off ${formatNaira(charge.balance)} owing — leaves ${formatNaira(
                                verdict.newBalance,
                              )}.`
                            : verdict.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      rows={3}
                      required
                      minLength={3}
                      placeholder="Why this was approved, and by whom if it was decided elsewhere."
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the record. It appears on the {mode === "discount" ? "discount" : "exemption"} list
                      and on the student&apos;s statement.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {verdict?.allowed
                        ? `Recording ${formatNaira(verdict.amount)} against ${charge?.description}.`
                        : "Choose a fee and an amount."}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" asChild>
                        <a href={`${basePath}/students/${statement.student.id}/statement`}>Statement</a>
                      </Button>
                      <Button type="submit" disabled={isPending || !verdict?.allowed}>
                        Apply {noun.toLowerCase()}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
