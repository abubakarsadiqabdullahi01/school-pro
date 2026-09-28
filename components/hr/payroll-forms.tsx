"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangle, Ban, Check, CreditCard, RotateCcw, Send } from "lucide-react"
import { toast } from "sonner"

import {
  approvePayroll,
  cancelPayroll,
  generatePayroll,
  payPayroll,
  reopenPayroll,
  submitPayrollForApproval,
} from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  canGeneratePayroll,
  payrollPeriodLabel,
  type PayrollRunSummary,
} from "@/lib/hr/payroll-period-rules"

const NONE = "NONE"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * Generating a month's payroll.
 *
 * Anyone skipped — no salary on record, not employed that month — is reported back rather
 * than quietly left out, because "why is Musa not on the payroll" is the question that
 * follows otherwise.
 *
 * A month is generated once, and never before it has started. Both are decided by
 * `canGeneratePayroll`, the same predicate the server refuses on: months already run are
 * struck out in the select rather than offered and then rejected, and the reason is on the
 * screen before the button is pressed.
 */
export function PayrollGenerateForm({
  basePath,
  sessions,
  existingRuns,
}: {
  basePath: string
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>
  /** Every run the school has, so a month that is spoken for can be shown as such. */
  existingRuns: PayrollRunSummary[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [sessionId, setSessionId] = useState(sessions.find((session) => session.isCurrent)?.id ?? NONE)
  const [skipped, setSkipped] = useState<Array<{ staffNo: string; name: string; reason: string }>>([])

  // Never a year ahead of this one: a run for next March would pay for work nobody has done.
  const years = Array.from({ length: 4 }, (_, index) => String(now.getFullYear() - 3 + index)).reverse()

  const today = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const facts = { existing: existingRuns, today }
  const target = { year: Number(year), month: Number(month) }
  const verdict = canGeneratePayroll(target, facts)

  /** Why a month cannot be picked, for the select. Null when it can. */
  const monthBlock = (index: number) => {
    const outcome = canGeneratePayroll({ year: Number(year), month: index + 1 }, facts)
    return outcome.allowed ? null : outcome.reason
  }

  function generate(formData: FormData) {
    startTransition(async () => {
      const result = await generatePayroll({
        year,
        month,
        sessionId: sessionId === NONE ? undefined : sessionId,
        notes: formData.get("notes") || undefined,
      })

      if (!result.success) {
        toast.error("Could not generate payroll", { description: result.error })
        return
      }

      setSkipped(result.data.skipped)
      toast.success(`Payroll generated for ${result.data.staffCount} staff`, {
        description: `Net ${result.data.totalNet}${
          result.data.status === "APPROVED" ? " — already approved, ready to pay" : " — awaiting approval"
        }`,
      })
      router.push(`${basePath}/payroll/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Payroll</CardTitle>
        <CardDescription>
          Builds a line for every active staff member with a salary on record. Figures are frozen onto each payslip as
          they are worked out, so a later change to an allowance cannot alter this run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={generate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, index) => {
                    const blocked = monthBlock(index)
                    return (
                      <SelectItem key={name} value={String(index + 1)} disabled={Boolean(blocked)}>
                        {name}
                        {blocked ? " · unavailable" : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger id="year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionId">Session</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger id="sessionId"><SelectValue placeholder="Not linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Optional" />
          </div>
          {!verdict.allowed && (
            <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm">{verdict.reason}</p>
            </div>
          )}

          {verdict.allowed && verdict.note && (
            <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm">{verdict.note}</p>
            </div>
          )}

          <Button type="submit" disabled={isPending || !verdict.allowed}>
            {isPending ? "Generating…" : `Generate ${payrollPeriodLabel(target)} Payroll`}
          </Button>
        </form>

        {skipped.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{skipped.length} staff were left out</p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {skipped.map((entry) => (
                  <li key={entry.staffNo}>
                    {entry.name} ({entry.staffNo}) — {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type PayrollStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "CANCELLED" | "REVERSED"

/**
 * The payroll workflow, as buttons.
 *
 * Nothing here is a security boundary — every action re-checks role and state on the
 * server. Hiding a button an accountant cannot use is courtesy, not protection.
 *
 * A paid run offers no reopen, only cancel: that is the payroll lock. Once salaries have
 * gone out, the figures are a matter of record and a correction has to be visible.
 */
export function PayrollWorkflowActions({
  basePath,
  runId,
  status,
  canManage,
  accounts,
  categories,
  defaultAccountId,
  defaultMethod,
}: {
  basePath: string
  runId: string
  status: PayrollStatus
  canManage: boolean
  accounts: Array<{ id: string; name: string; balance: string; isActive: boolean }>
  categories: Array<{ id: string; name: string; isActive: boolean }>
  defaultAccountId: string | null
  defaultMethod: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<"pay" | "cancel" | "reopen" | null>(null)
  const [reason, setReason] = useState("")
  const [overdraft, setOverdraft] = useState<string | null>(null)

  const activeAccounts = accounts.filter((account) => account.isActive)
  const salaryCategory = categories.find((category) => /salar/i.test(category.name) && category.isActive)
  const [accountId, setAccountId] = useState(defaultAccountId ?? activeAccounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState(salaryCategory?.id ?? "")
  const [method, setMethod] = useState(defaultMethod)
  const [reference, setReference] = useState("")

  function close() {
    setDialog(null)
    setReason("")
    setOverdraft(null)
  }

  function done(message: string) {
    toast.success(message)
    close()
    router.refresh()
  }

  function submit() {
    startTransition(async () => {
      const result = await submitPayrollForApproval({ runId })
      if (!result.success) {
        toast.error("Could not submit", { description: result.error })
        return
      }
      done("Sent for approval")
    })
  }

  function approve() {
    startTransition(async () => {
      const result = await approvePayroll({ runId })
      if (!result.success) {
        toast.error("Could not approve", { description: result.error })
        return
      }
      done("Payroll approved")
    })
  }

  function reopen() {
    startTransition(async () => {
      const result = await reopenPayroll({ runId, reason })
      if (!result.success) {
        toast.error("Could not reopen", { description: result.error })
        return
      }
      done("Payroll reopened as a draft")
    })
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelPayroll({ runId, reason })
      if (!result.success) {
        toast.error("Could not cancel", { description: result.error })
        return
      }
      done("Payroll cancelled")
    })
  }

  function pay(allowOverdraft: boolean) {
    startTransition(async () => {
      const result = await payPayroll({
        runId,
        accountId,
        categoryId: categoryId || undefined,
        method,
        reference: reference || undefined,
        allowOverdraft,
      })
      if (!result.success) {
        if (result.error.includes("Allow the overdraft")) {
          setOverdraft(result.error)
          return
        }
        toast.error("Could not pay the payroll", { description: result.error })
        return
      }
      done(`Salaries paid. Booked as expenditure ${result.data.expenseVoucherNo}`)
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {status === "DRAFT" && (
          <Button size="sm" onClick={submit} disabled={isPending}>
            <Send className="mr-2 h-4 w-4" />
            Send for approval
          </Button>
        )}

        {canManage && (status === "DRAFT" || status === "PENDING_APPROVAL") && (
          <Button size="sm" onClick={approve} disabled={isPending}>
            <Check className="mr-2 h-4 w-4" />
            Approve
          </Button>
        )}

        {status === "APPROVED" && (
          <Button size="sm" onClick={() => setDialog("pay")} disabled={isPending}>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay salaries
          </Button>
        )}

        {canManage && (status === "PENDING_APPROVAL" || status === "APPROVED") && (
          <Button size="sm" variant="outline" onClick={() => setDialog("reopen")} disabled={isPending}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reopen
          </Button>
        )}

        {canManage && status !== "CANCELLED" && status !== "REVERSED" && (
          <Button size="sm" variant="outline" onClick={() => setDialog("cancel")} disabled={isPending}>
            <Ban className="mr-2 h-4 w-4" />
            {status === "PAID" ? "Reverse payroll" : "Cancel"}
          </Button>
        )}
      </div>

      <Dialog open={dialog === "cancel" || dialog === "reopen"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "reopen" ? "Reopen this payroll" : "Cancel this payroll"}</DialogTitle>
            <DialogDescription>
              {dialog === "reopen"
                ? "It goes back to a draft so the figures can be corrected, and the approval is cleared."
                : status === "PAID"
                  ? "The run and its payslips stay on the record but drop out of every total. Say why, so the reversal can be explained later."
                  : "The run stays on the record and drops out of the totals. Say why."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payroll-reason">Reason</Label>
            <Textarea
              id="payroll-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="At least a few words"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isPending}>Back</Button>
            <Button
              onClick={dialog === "reopen" ? reopen : cancel}
              disabled={isPending || reason.trim().length < 3}
            >
              {dialog === "reopen" ? "Reopen" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "pay"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay salaries</DialogTitle>
            <DialogDescription>
              This releases the money and books it as expenditure, so payroll appears in the budget summary like any
              other spending.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-account">Pay from</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="pay-account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} — {account.balance}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-category">Expenditure category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="pay-category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((category) => category.isActive)
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {!salaryCategory && (
                <p className="text-xs text-muted-foreground">
                  No category named “Salaries” yet — pick one, or create it under Expenditure.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-method">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-reference">Bank reference <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="pay-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. the bulk transfer ID"
              />
            </div>

            {overdraft && (
              <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm">{overdraft}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isPending}>Back</Button>
            {overdraft ? (
              <Button variant="destructive" onClick={() => pay(true)} disabled={isPending}>Pay anyway</Button>
            ) : (
              <Button onClick={() => pay(false)} disabled={isPending || !accountId || !categoryId}>
                Confirm payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status === "PAID" && (
        <Button size="sm" variant="outline" asChild className="print:hidden">
          <Link href={`${basePath}/payroll`}>Back to payroll</Link>
        </Button>
      )}
    </>
  )
}
