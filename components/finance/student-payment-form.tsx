"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { getStudentStatement, recordStudentPayment, searchFinanceStudents } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { StudentSearchResults, type FinanceStudentSearchRow } from "@/components/finance/student-search-results"
import { FilterSelect } from "@/components/reports/filter-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PAYMENT_METHODS } from "@/lib/finance/payment-method"
import {
  allocateAmount,
  allocationTotal,
  toKobo,
  validateAllocations,
} from "@/lib/finance/payment-allocation"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

type StudentSearchRow = FinanceStudentSearchRow

type Charge = {
  id: string
  termId: string | null
  termName: string | null
  categoryName: string | null
  description: string
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
 * Taking money at the counter.
 *
 * Two things this screen has to get right. The first is finding the student: a parent says a
 * class and a first name, so the list is filtered rather than only searched. The second is
 * the amount — a family pays what they have, against the fee they choose, so every charge
 * carries its own editable amount instead of a tick that means "all of it". The old screen
 * could only take a whole charge, which meant a part payment was either refused or written
 * down somewhere the system never saw.
 */
export function StudentPaymentForm({
  basePath,
  initialStudentId,
  classes,
}: {
  basePath: string
  initialStudentId?: string
  /** The classes of the current session, for narrowing the search. */
  classes: ClassOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [classTermId, setClassTermId] = useState<string | undefined>(undefined)
  const [owingOnly, setOwingOnly] = useState(true)
  const [students, setStudents] = useState<StudentSearchRow[]>([])
  const [statement, setStatement] = useState<Statement | null>(null)
  /** Per charge, what is being paid now. Keyed by charge id; blank means nothing. */
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [tendered, setTendered] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [lastReceipt, setLastReceipt] = useState<{ id: string; receiptNo: string } | null>(null)

  const openCharges = useMemo(
    () => statement?.charges.filter((charge) => Number(charge.balance) > 0) ?? [],
    [statement],
  )

  const allocations = useMemo(
    () =>
      openCharges
        .map((charge) => ({ chargeId: charge.id, amount: Number(amounts[charge.id] ?? "") || 0 }))
        .filter((allocation) => allocation.amount > 0),
    [openCharges, amounts],
  )

  const allocatable = useMemo(
    () => openCharges.map((charge) => ({ id: charge.id, balance: Number(charge.balance) })),
    [openCharges],
  )

  const total = allocationTotal(allocations)
  const problem = allocations.length > 0 ? validateAllocations(allocations, allocatable) : null
  const tenderedAmount = Number(tendered) || 0
  const unapplied = toKobo(Math.max(tenderedAmount - total, 0))

  const search = useCallback(() => {
    startTransition(async () => {
      const result = await searchFinanceStudents({ query, classTermId, owingOnly })
      if (result.success) {
        setStudents(result.data)
      } else {
        toast.error("Search failed", { description: result.error })
      }
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
      // Nothing is filled in by default. A cashier types what was handed over, and a screen
      // that arrives pre-filled with the full balance invites a receipt for money nobody paid.
      setAmounts({})
      setTendered("")
    })
  }, [])

  // Arriving from the debtor list with a student already chosen. Loaded once, so a later
  // payment against the same student does not get reset by this effect re-running.
  const hasLoadedInitial = useRef(false)
  useEffect(() => {
    if (!initialStudentId || hasLoadedInitial.current) return
    hasLoadedInitial.current = true
    loadStudent(initialStudentId)
  }, [initialStudentId, loadStudent])

  /** Spreads what the parent handed over across the fees, oldest first. */
  const spreadTendered = () => {
    const { allocations: spread, unallocated } = allocateAmount(allocatable, tenderedAmount)
    setAmounts(Object.fromEntries(spread.map((allocation) => [allocation.chargeId, String(allocation.amount)])))

    if (unallocated > 0) {
      toast.warning(`${formatNaira(unallocated)} could not be applied`, {
        description: "That is more than this student owes. The rest is left unallocated.",
      })
    }
  }

  const payInFull = (charge: Charge) => {
    setAmounts((current) => ({ ...current, [charge.id]: String(Number(charge.balance)) }))
  }

  const setAmount = (chargeId: string, value: string) => {
    setAmounts((current) => ({ ...current, [chargeId]: value }))
  }

  function recordPayment(formData: FormData) {
    if (!statement) return

    const issue = validateAllocations(allocations, allocatable)
    if (issue) {
      toast.error("Check the amounts", { description: issue.message })
      return
    }

    // The receipt is stamped with the term of what is being settled. Where a payment clears
    // arrears across terms, the newest one wins and the allocations carry the detail — which
    // is what the statement and the receipt both read from.
    const paidCharges = openCharges.filter((charge) => allocations.some((a) => a.chargeId === charge.id))
    const termId = paidCharges.at(-1)?.termId ?? paidCharges[0]?.termId
    if (!termId) {
      toast.error("Payment needs a term", { description: "The selected charges have no term attached." })
      return
    }

    startTransition(async () => {
      const result = await recordStudentPayment({
        studentId: statement.student.id,
        termId,
        paymentDate: String(formData.get("paymentDate") || new Date().toISOString().slice(0, 10)),
        paymentMethod,
        referenceNo: String(formData.get("referenceNo") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        allocations,
      })

      if (result.success) {
        setLastReceipt(result.data)
        toast.success("Payment recorded", { description: `Receipt ${result.data.receiptNo} · ${formatNaira(total)}` })
        loadStudent(statement.student.id)
      } else {
        toast.error("Payment failed", { description: result.error })
      }
    })
  }

  const classOptions = classes.map((option) => ({
    value: option.id,
    label: `${option.className} · ${option.termName}`,
  }))

  return (
    <div className="space-y-4">
      <BackButton fallbackHref={basePath} />
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
              id="payment-class"
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

            <p className="text-xs text-muted-foreground">Results update as you type.</p>
            <StudentSearchResults
              students={students}
              onSelect={(student) => {
                setLastReceipt(null)
                loadStudent(student.id)
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{statement ? statement.student.name : "Outstanding Charges"}</CardTitle>
            <CardDescription>
              {statement
                ? `${statement.student.admissionNo} · ${statement.student.currentClass ?? "No class"} · ${
                    statement.student.currentTerm ?? "No term"
                  }`
                : "Select a student to record payment."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statement ? (
              <>
                {lastReceipt && (
                  <div className="flex flex-col gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      Payment saved: {lastReceipt.receiptNo}
                    </span>
                    <Button size="sm" asChild>
                      <Link href={`${basePath}/receipts/${lastReceipt.id}`}>View Receipt</Link>
                    </Button>
                  </div>
                )}

                {/* The whole account at a glance, so a cashier is not taking money against a
                    figure they have to work out from the rows below. */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Billed</p>
                    <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.charged)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Paid so far</p>
                    <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.paid)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="text-lg font-semibold tabular-nums">{formatNaira(statement.totals.balance)}</p>
                  </div>
                </div>

                {openCharges.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Nothing is outstanding for this student.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="tendered">Amount received</Label>
                        <Input
                          id="tendered"
                          type="number"
                          min="0"
                          step="0.01"
                          value={tendered}
                          onChange={(event) => setTendered(event.target.value)}
                          placeholder="What the parent handed over"
                          className="tabular-nums"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={spreadTendered} disabled={tenderedAmount <= 0}>
                          Spread oldest first
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setAmounts({})
                            setTendered("")
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {openCharges.map((charge) => {
                        const value = amounts[charge.id] ?? ""
                        const entered = Number(value) || 0
                        const over = entered > Number(charge.balance)

                        return (
                          <div
                            key={charge.id}
                            className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{charge.description}</span>
                                {charge.status === "PARTIAL" && <Badge variant="secondary">Part paid</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {[charge.categoryName, charge.termName].filter(Boolean).join(" · ")}
                                {charge.dueDate ? ` · due ${formatDocumentDate(charge.dueDate)}` : ""}
                              </p>
                              <p className="text-sm tabular-nums text-muted-foreground">
                                Paid {formatNaira(charge.paid)} of {formatNaira(charge.amount)} ·{" "}
                                <span className="font-medium text-foreground">
                                  {formatNaira(charge.balance)} owing
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 sm:w-64">
                              <Input
                                type="number"
                                min="0"
                                max={Number(charge.balance)}
                                step="0.01"
                                value={value}
                                onChange={(event) => setAmount(charge.id, event.target.value)}
                                placeholder="0.00"
                                aria-label={`Amount paid against ${charge.description}`}
                                aria-invalid={over}
                                className="tabular-nums"
                              />
                              <Button type="button" variant="outline" size="sm" onClick={() => payInFull(charge)}>
                                Full
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <form action={recordPayment} className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payment-method">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger id="payment-method" className="w-full">
                        <SelectValue>
                          {PAYMENT_METHODS.find((method) => method.value === paymentMethod)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      name="paymentDate"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reference">
                      Bank / POS Reference <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input id="reference" name="referenceNo" placeholder="Auto receipt no. if blank" />
                    <p className="text-xs text-muted-foreground">
                      Enter the bank transfer, POS, cheque, or online transaction ID when available. If left
                      blank, the generated receipt number is saved as the reference.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" name="notes" placeholder="Anything the receipt should record" />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-semibold tabular-nums">
                        Receipt total: {formatNaira(total)}
                        {allocations.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            across {allocations.length} fee{allocations.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" asChild>
                          <Link href={`${basePath}/students/${statement.student.id}/statement`}>Statement</Link>
                        </Button>
                        <Button type="submit" disabled={isPending || total <= 0 || Boolean(problem)}>
                          Record Payment
                        </Button>
                      </div>
                    </div>
                    {problem && <p className="text-sm text-destructive">{problem.message}</p>}
                    {!problem && unapplied > 0 && (
                      <p className="text-sm text-amber-600 dark:text-amber-500">
                        {formatNaira(unapplied)} of what was received is not allocated to any fee. Put it on a
                        fee, or take only {formatNaira(total)}.
                      </p>
                    )}
                  </div>
                </form>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No student selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
