"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { getStudentStatement, recordStudentPayment, searchFinanceStudents } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatNaira } from "@/lib/money"

type StudentSearchRow = {
  id: string
  admissionNo: string
  name: string
  currentClass: string | null
  outstanding: string
}

type Statement = {
  student: { id: string; admissionNo: string; name: string }
  totals: { charged: string; paid: string; discounts: string; exemptions: string; balance: string }
  charges: Array<{ id: string; termId: string | null; description: string; amount: string; paid: string; balance: string; status: string }>
}

export function StudentPaymentForm({ basePath, initialStudentId }: { basePath: string; initialStudentId?: string }) {
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<StudentSearchRow[]>([])
  const [statement, setStatement] = useState<Statement | null>(null)
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())
  const [paymentMethod, setPaymentMethod] = useState("CASH")

  const selectedCharges = useMemo(
    () => statement?.charges.filter((charge) => selectedChargeIds.has(charge.id)) ?? [],
    [statement, selectedChargeIds],
  )
  const total = selectedCharges.reduce((sum, charge) => sum + Number(charge.balance), 0)

  function search() {
    startTransition(async () => {
      const result = await searchFinanceStudents(query)
      if (result.success) {
        setStudents(result.data)
      } else {
        toast.error("Search failed", { description: result.error })
      }
    })
  }

  const loadStudent = useCallback((studentId: string) => {
    startTransition(async () => {
      const result = await getStudentStatement(studentId)
      if (result.success) {
        setStatement(result.data)
        setSelectedChargeIds(new Set(result.data.charges.filter((charge) => Number(charge.balance) > 0).map((charge) => charge.id)))
      } else {
        toast.error("Statement failed", { description: result.error })
      }
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

  function toggleCharge(id: string) {
    setSelectedChargeIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function recordPayment(formData: FormData) {
    if (!statement || selectedCharges.length === 0) return
    const termId = selectedCharges[0]?.termId
    if (!termId) {
      toast.error("Payment needs a term", { description: "Selected charges do not have a term attached." })
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
        allocations: selectedCharges.map((charge) => ({ chargeId: charge.id, amount: Number(charge.balance) })),
      })

      if (result.success) {
        toast.success("Payment recorded", { description: `Receipt ${result.data.receiptNo}` })
        loadStudent(statement.student.id)
      } else {
        toast.error("Payment failed", { description: result.error })
      }
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Find Student</CardTitle>
          <CardDescription>Search by name or admission number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name or admission no" />
            <Button type="button" onClick={search} disabled={isPending}>Search</Button>
          </div>
          <div className="space-y-2">
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => loadStudent(student.id)}
                className="w-full rounded-md border p-3 text-left hover:bg-muted"
              >
                <div className="font-medium">{student.name}</div>
                <div className="text-sm text-muted-foreground">
                  {student.admissionNo} · {student.currentClass ?? "No class"} · Owes {formatNaira(student.outstanding)}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{statement ? statement.student.name : "Outstanding Charges"}</CardTitle>
          <CardDescription>
            {statement ? `${statement.student.admissionNo} · Balance ${formatNaira(statement.totals.balance)}` : "Select a student to record payment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statement ? (
            <>
              <div className="space-y-2">
                {statement.charges.filter((charge) => Number(charge.balance) > 0).map((charge) => (
                  <label key={charge.id} className="flex items-center justify-between rounded-md border p-3">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedChargeIds.has(charge.id)}
                        onChange={() => toggleCharge(charge.id)}
                        className="h-4 w-4"
                      />
                      <span>
                        <span className="block font-medium">{charge.description}</span>
                        <span className="text-sm text-muted-foreground">Paid {formatNaira(charge.paid)} of {formatNaira(charge.amount)}</span>
                      </span>
                    </span>
                    <span className="font-medium">{formatNaira(charge.balance)}</span>
                  </label>
                ))}
              </div>

              <form action={recordPayment} className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="POS">POS</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-date">Payment Date</Label>
                  <Input id="payment-date" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input id="reference" name="referenceNo" placeholder="Bank/POS reference" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <p className="font-medium">Total: {formatNaira(total)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`${basePath}/students/${statement.student.id}/statement`}>Statement</Link>
                    </Button>
                    <Button type="submit" disabled={isPending || total <= 0}>Record Payment</Button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No student selected.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
