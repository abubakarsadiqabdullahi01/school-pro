"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { requestGatewayRefund } from "@/app/actions/gateway-operations-slice7"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RequestRefundButton({ transactionId }: { transactionId: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [reason, setReason] = useState("")
  const [error, setError] = useState(""); const [pending, start] = useTransition()
  if (!open) return <Button variant="destructive" onClick={() => setOpen(true)}><RotateCcw className="mr-2 h-4 w-4" />Request full refund</Button>
  return <div className="space-y-3 rounded-md border border-destructive/30 p-4">
    <p className="text-sm font-medium">This asks for a full refund. A different authorised person must approve it before it is sent to Paystack, and the receipt stays completed until Paystack confirms processing.</p>
    <div className="space-y-1"><Label htmlFor="refund-reason">Reason (required)</Label><Input id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Explain the approved refund" /></div>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <div className="flex gap-2"><Button variant="destructive" disabled={pending || reason.trim().length < 10} onClick={() => start(async () => {
      setError(""); const result = await requestGatewayRefund({ transactionId, reason, confirmation: true })
      if (!result.success) return setError(result.error); setOpen(false); router.refresh()
    })}>{pending ? "Submitting…" : "Request full refund"}</Button><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button></div>
  </div>
}
