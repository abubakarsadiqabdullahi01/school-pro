"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  approveStudentPaymentRefund,
  rejectStudentPaymentRefund,
  requestStudentPaymentRefund,
  withdrawStudentPaymentRefund,
} from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/** Asks for a counter refund. A second person with refund approval decides it. */
export function RefundPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [isPending, startTransition] = useTransition()

  function request() {
    startTransition(async () => {
      const result = await requestStudentPaymentRefund({ paymentId, reason, referenceNo: referenceNo || undefined })
      if (!result.success) {
        toast.error("Refund not requested", { description: result.error })
        return
      }
      toast.success("Refund requested", { description: "A second person with refund approval must approve it before the receipt is reversed." })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="mr-2 h-4 w-4" /> Refund
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask to refund this payment</DialogTitle>
            <DialogDescription>
              Money going back to a payer takes two people. Once a different person with refund approval
              approves it, the receipt stays on record as refunded and every allocation returns to the student&apos;s balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reference">Refund reference</Label>
              <Input id="refund-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Back</Button>
            <Button variant="destructive" onClick={request} disabled={isPending || reason.trim().length < 3}>
              Ask for refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A counter refund waiting on this receipt: approve or decline it, or take it back. */
export function PendingRefundDecision({
  requestId,
  reason,
  requestedByName,
  requestedAt,
  canApprove,
  isRequester,
}: {
  requestId: string
  reason: string
  requestedByName: string
  requestedAt: string
  canApprove: boolean
  isRequester: boolean
}) {
  const router = useRouter()
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const run = (action: () => Promise<{ success: true } | { success: false; error: string }>, done: string) =>
    startTransition(async () => {
      setError("")
      const result = await action()
      if (!result.success) return setError(result.error)
      toast.success(done)
      router.refresh()
    })

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm print:hidden">
      <p>
        <span className="font-medium">Refund requested</span> by {isRequester ? "you" : requestedByName} on{" "}
        {new Date(requestedAt).toLocaleDateString("en-NG")}: {reason}
      </p>
      <p className="text-xs text-muted-foreground">
        The receipt stands until {isRequester ? "a different person with refund approval" : "someone with refund approval"} decides.
      </p>
      {declining && (
        <Input aria-label="Why decline" placeholder="Why it is declined" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} />
      )}
      {error && <p className="text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canApprove && !isRequester && !declining && (
          <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(() => approveStudentPaymentRefund({ requestId, confirmation: true }), "Refund approved; the receipt is reversed")}>
            Approve refund
          </Button>
        )}
        {canApprove && !declining && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setDeclining(true)}>Decline</Button>
        )}
        {declining && (
          <>
            <Button size="sm" disabled={isPending || declineReason.trim().length < 3} onClick={() => run(() => rejectStudentPaymentRefund({ requestId, reason: declineReason }), "Refund declined")}>
              Decline refund
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setDeclining(false)}>Back</Button>
          </>
        )}
        {isRequester && !declining && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => withdrawStudentPaymentRefund({ requestId }), "Refund request withdrawn")}>
            Withdraw request
          </Button>
        )}
      </div>
    </div>
  )
}
