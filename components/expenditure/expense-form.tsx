"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { createExpense, updateExpense } from "@/app/actions/expenditure"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Option = { id: string; name: string }
type TermOption = { id: string; name: string; sessionId: string; isCurrent: boolean }

export type ExpenseFormValues = {
  id: string
  termId: string
  categoryId: string
  accountId: string
  payeeName: string
  payeeType: string
  description: string
  amount: string
  paymentMethod: string
  referenceNo: string | null
  expenseDate: string
  notes: string | null
}

const PAYEE_TYPES = [
  { value: "VENDOR", label: "Vendor / supplier" },
  { value: "STAFF", label: "Member of staff" },
  { value: "PARENT", label: "Parent" },
  { value: "STUDENT", label: "Student" },
  { value: "OTHER", label: "Other" },
]

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "POS", label: "POS" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
]

/** yyyy-mm-dd, which is what a native date input expects. */
function dateInputValue(iso?: string): string {
  return (iso ? new Date(iso) : new Date()).toISOString().slice(0, 10)
}

export function ExpenseForm({
  basePath,
  categories,
  accounts,
  terms,
  expense,
}: {
  basePath: string
  categories: Option[]
  accounts: Option[]
  terms: TermOption[]
  /** Present when editing. Only a draft or pending expense can be edited. */
  expense?: ExpenseFormValues
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [termId, setTermId] = useState(expense?.termId ?? terms.find((term) => term.isCurrent)?.id ?? "")
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "")
  const [accountId, setAccountId] = useState(expense?.accountId ?? "")
  const [payeeType, setPayeeType] = useState(expense?.payeeType ?? "VENDOR")
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "CASH")
  /**
   * Set when the server refuses a same-payee, same-amount, same-day expense. The form keeps
   * what was typed and offers a deliberate second press rather than silently retrying.
   */
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  const isEditing = Boolean(expense)

  function submit(formData: FormData, options: { submitForApproval: boolean; confirmDuplicate: boolean }) {
    const payload = {
      termId,
      categoryId,
      accountId,
      payeeName: formData.get("payeeName"),
      payeeType,
      description: formData.get("description"),
      amount: formData.get("amount"),
      paymentMethod,
      referenceNo: formData.get("referenceNo") || undefined,
      expenseDate: formData.get("expenseDate"),
      notes: formData.get("notes") || undefined,
      submit: options.submitForApproval,
      confirmDuplicate: options.confirmDuplicate,
    }

    startTransition(async () => {
      // Kept as two branches rather than one: create and update return different shapes,
      // and only create reports the voucher number and the budget position.
      if (expense) {
        const result = await updateExpense({ ...payload, expenseId: expense.id })
        if (!result.success) {
          toast.error("Could not save the expense", { description: result.error })
          return
        }
        toast.success("Expense saved")
        router.push(`${basePath}/transactions/${expense.id}`)
        router.refresh()
        return
      }

      const result = await createExpense(payload)
      if (!result.success) {
        // The duplicate guard is the one error worth keeping the form open for.
        if (result.error.includes("Confirm the duplicate")) {
          setDuplicateWarning(result.error)
          return
        }
        toast.error("Could not record the expense", { description: result.error })
        return
      }

      setDuplicateWarning(null)
      toast.success(
        options.submitForApproval ? "Expense recorded and sent for approval" : "Draft saved",
        { description: `Voucher ${result.data.voucherNo}` },
      )

      // Recorded either way — a budget is a warning, not a gate.
      if (result.data.budget && Number(result.data.budget.overBy) > 0) {
        toast.warning("This category is over its termly budget", {
          description: `Over by ${result.data.budget.overBy}. The expense was still recorded.`,
        })
      }

      router.push(`${basePath}/transactions/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Expense" : "Record Expenditure"}</CardTitle>
        <CardDescription>
          {isEditing
            ? "Only a draft or an expense still awaiting approval can be edited. Once approved, correct it by cancelling with a reason."
            : "Save it as a draft to finish later, or send it straight for approval. A voucher number is issued either way."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          action={(formData) => submit(formData, { submitForApproval: true, confirmDuplicate: false })}
        >
          <Field label="Term" htmlFor="termId">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger id="termId"><SelectValue placeholder="Select a term" /></SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}{term.isCurrent ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Expense date" htmlFor="expenseDate">
            <Input id="expenseDate" name="expenseDate" type="date" required defaultValue={dateInputValue(expense?.expenseDate)} />
          </Field>

          <Field label="Category" htmlFor="categoryId">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="categoryId"><SelectValue placeholder="What was it spent on?" /></SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Paid from" htmlFor="accountId">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="accountId"><SelectValue placeholder="Which account or cash source?" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Payee" htmlFor="payeeName">
            <Input id="payeeName" name="payeeName" required defaultValue={expense?.payeeName} placeholder="Who received the money?" />
          </Field>

          <Field label="Payee type" htmlFor="payeeType">
            <Select value={payeeType} onValueChange={setPayeeType}>
              <SelectTrigger id="payeeType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYEE_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Amount" htmlFor="amount">
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              required
              defaultValue={expense?.amount}
            />
          </Field>

          <Field label="Payment method" htmlFor="paymentMethod">
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="paymentMethod"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Reference / transaction ID" htmlFor="referenceNo">
            <Input id="referenceNo" name="referenceNo" defaultValue={expense?.referenceNo ?? ""} placeholder="Optional" />
          </Field>

          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" required rows={2} defaultValue={expense?.description} />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={expense?.notes ?? ""} placeholder="Optional" />
          </div>

          {duplicateWarning && (
            <div className="sm:col-span-2 flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-3">
                <p className="text-sm">{duplicateWarning}</p>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  formAction={(formData) => submit(formData, { submitForApproval: true, confirmDuplicate: true })}
                >
                  Yes, this is a second payment
                </Button>
              </div>
            </div>
          )}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || !termId || !categoryId || !accountId}>
              {isEditing ? "Save and submit" : "Send for approval"}
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isPending || !termId || !categoryId || !accountId}
              formAction={(formData) => submit(formData, { submitForApproval: false, confirmDuplicate: false })}
            >
              Save as draft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
