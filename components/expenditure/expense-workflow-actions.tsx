"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertTriangle, Ban, Check, CreditCard, X } from "lucide-react"
import { toast } from "sonner"

import { approveExpense, cancelExpense, markExpensePaid, rejectExpense } from "@/app/actions/expenditure"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"

type Status = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "REJECTED" | "CANCELLED"

/**
 * The approval trail, as buttons.
 *
 * Which buttons appear is driven by status and role, but nothing here is a security
 * boundary — every action re-checks the role and the state on the server. Hiding a button
 * an accountant cannot use is courtesy, not protection.
 *
 * Rejecting and cancelling both demand a reason. A payment that vanished from the ledger
 * without one is the thing an auditor cannot forgive.
 */
export function ExpenseWorkflowActions({
  expenseId,
  status,
  canManage,
  accountName,
}: {
  expenseId: string
  status: Status
  /** Admin or super admin: may approve, reject and cancel. */
  canManage: boolean
  accountName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<"reject" | "cancel" | "pay" | null>(null)
  const [reason, setReason] = useState("")
  const [reference, setReference] = useState("")
  /** Set when the account cannot cover the payment; the admin may still force it through. */
  const [overdraft, setOverdraft] = useState<string | null>(null)

  const awaitingDecision = status === "DRAFT" || status === "PENDING_APPROVAL"
  const cancellable = status !== "CANCELLED" && status !== "REJECTED"

  function close() {
    setDialog(null)
    setReason("")
    setReference("")
    setOverdraft(null)
  }

  function done(message: string) {
    toast.success(message)
    close()
    router.refresh()
  }

  function approve() {
    startTransition(async () => {
      const result = await approveExpense({ expenseId })
      if (!result.success) {
        toast.error("Could not approve", { description: result.error })
        return
      }
      done("Expense approved")
    })
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectExpense({ expenseId, reason })
      if (!result.success) {
        toast.error("Could not reject", { description: result.error })
        return
      }
      done("Expense rejected")
    })
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelExpense({ expenseId, reason })
      if (!result.success) {
        toast.error("Could not cancel", { description: result.error })
        return
      }
      done("Expense cancelled")
    })
  }

  function pay(allowOverdraft: boolean) {
    startTransition(async () => {
      const result = await markExpensePaid({
        expenseId,
        referenceNo: reference || undefined,
        allowOverdraft,
      })
      if (!result.success) {
        // The overdraft guard keeps the dialog open so the decision is a separate press.
        if (result.error.includes("Allow the overdraft")) {
          setOverdraft(result.error)
          return
        }
        toast.error("Could not mark as paid", { description: result.error })
        return
      }
      done(`Paid. ${accountName} now holds ${result.data.accountBalance}`)
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {canManage && awaitingDecision && (
          <>
            <Button size="sm" onClick={approve} disabled={isPending}>
              <Check className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("reject")} disabled={isPending}>
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </>
        )}

        {status === "APPROVED" && (
          <Button size="sm" onClick={() => setDialog("pay")} disabled={isPending}>
            <CreditCard className="mr-2 h-4 w-4" />
            Mark as paid
          </Button>
        )}

        {canManage && cancellable && (
          <Button size="sm" variant="outline" onClick={() => setDialog("cancel")} disabled={isPending}>
            <Ban className="mr-2 h-4 w-4" />
            {status === "PAID" ? "Reverse payment" : "Cancel"}
          </Button>
        )}
      </div>

      <Dialog open={dialog === "reject" || dialog === "cancel"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "reject" ? "Reject this expense" : "Cancel this expense"}</DialogTitle>
            <DialogDescription>
              {dialog === "reject"
                ? "The recorder will see why it was turned down."
                : status === "PAID"
                  ? "The record stays and keeps its voucher number, but drops out of every total. Say why, so the reversal can be explained later."
                  : "The record stays and drops out of every total. Say why."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="At least a few words"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isPending}>Back</Button>
            <Button
              onClick={dialog === "reject" ? reject : cancel}
              disabled={isPending || reason.trim().length < 3}
            >
              {dialog === "reject" ? "Reject" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "pay"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as paid</DialogTitle>
            <DialogDescription>
              This releases the money from {accountName}. Add the bank or POS reference if there is one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference / transaction ID</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Optional"
            />
          </div>

          {overdraft && (
            <div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm">{overdraft}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isPending}>Back</Button>
            {overdraft ? (
              <Button variant="destructive" onClick={() => pay(true)} disabled={isPending}>
                Pay anyway
              </Button>
            ) : (
              <Button onClick={() => pay(false)} disabled={isPending}>Confirm payment</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
