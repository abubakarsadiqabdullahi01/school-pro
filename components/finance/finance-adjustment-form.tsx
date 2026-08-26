"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  applyChargeDiscount,
  applyChargeExemption,
  getStudentStatement,
  searchFinanceStudents,
} from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatNaira } from "@/lib/money"

type Mode = "discount" | "exemption"

type StudentSearchRow = {
  id: string
  admissionNo: string
  name: string
  currentClass: string | null
  outstanding: string
}

type Charge = {
  id: string
  description: string
  amount: string
  paid: string
  balance: string
  status: string
}

export function FinanceAdjustmentForm({ mode }: { mode: Mode }) {
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<StudentSearchRow[]>([])
  const [student, setStudent] = useState<StudentSearchRow | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [chargeId, setChargeId] = useState("")
  const [type, setType] = useState("FIXED")

  const selectedCharge = charges.find((charge) => charge.id === chargeId)
  const title = mode === "discount" ? "Apply Discount" : "Apply Exemption"
  const action = mode === "discount" ? applyChargeDiscount : applyChargeExemption

  function search() {
    startTransition(async () => {
      const result = await searchFinanceStudents(query)
      if (result.success) setStudents(result.data)
      else toast.error("Search failed", { description: result.error })
    })
  }

  function selectStudent(nextStudent: StudentSearchRow) {
    startTransition(async () => {
      const result = await getStudentStatement(nextStudent.id)
      if (result.success) {
        setStudent(nextStudent)
        const openCharges = result.data.charges.filter((charge) => Number(charge.balance) > 0)
        setCharges(openCharges)
        setChargeId(openCharges[0]?.id ?? "")
      } else {
        toast.error("Statement failed", { description: result.error })
      }
    })
  }

  function submit(formData: FormData) {
    if (!student || !chargeId) return
    startTransition(async () => {
      const result = await action({
        studentId: student.id,
        chargeId,
        type,
        value: Number(formData.get("value") ?? 0),
        reason: String(formData.get("reason") ?? ""),
      })

      if (result.success) {
        toast.success(`${mode === "discount" ? "Discount" : "Exemption"} applied`, {
          description: `${formatNaira(result.data.amountApplied)} applied to the selected charge.`,
        })
        selectStudent(student)
      } else {
        toast.error("Adjustment failed", { description: result.error })
      }
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Find Student</CardTitle>
          <CardDescription>Choose the student whose fee should be adjusted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name or admission no" />
            <Button type="button" onClick={search} disabled={isPending}>Search</Button>
          </div>
          <div className="space-y-2">
            {students.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => selectStudent(row)}
                className="w-full rounded-md border p-3 text-left hover:bg-muted"
              >
                <div className="font-medium">{row.name}</div>
                <div className="text-sm text-muted-foreground">
                  {row.admissionNo} · {row.currentClass ?? "No class"} · Balance {formatNaira(row.outstanding)}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {student ? `${student.name} · ${student.admissionNo}` : "Select a student with an unpaid charge."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Charge</Label>
              <Select value={chargeId} onValueChange={setChargeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select charge" />
                </SelectTrigger>
                <SelectContent>
                  {charges.map((charge) => (
                    <SelectItem key={charge.id} value={charge.id}>
                      {charge.description} · {formatNaira(charge.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCharge && (
                <p className="text-sm text-muted-foreground">
                  Original/final charge {formatNaira(selectedCharge.amount)} · paid {formatNaira(selectedCharge.paid)} · open balance {formatNaira(selectedCharge.balance)}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">{type === "PERCENTAGE" ? "Percentage" : "Amount"}</Label>
                <Input id="value" name="value" type="number" min="1" step="0.01" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" rows={3} required />
            </div>

            <Button type="submit" disabled={isPending || !student || !chargeId}>
              {title}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
