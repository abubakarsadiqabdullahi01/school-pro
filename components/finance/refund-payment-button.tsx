"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { refundStudentPayment } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function RefundPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [isPending, startTransition] = useTransition()

  function refund() {
    startTransition(async () => {
      const result = await refundStudentPayment({ paymentId, reason, referenceNo: referenceNo || undefined })
      if (!result.success) {
        toast.error("Refund failed", { description: result.error })
        return
      }
      toast.success("Payment refunded", { description: "The fee balances and receipt status were updated together." })
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
            <DialogTitle>Refund this payment</DialogTitle>
            <DialogDescription>
              The receipt remains on record as refunded and every allocation returns to the student&apos;s balance.
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
            <Button variant="destructive" onClick={refund} disabled={isPending || reason.trim().length < 3}>
              Confirm refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
