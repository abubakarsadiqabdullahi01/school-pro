"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, X } from "lucide-react"

import { approveGatewayRefund, rejectGatewayRefund } from "@/app/actions/gateway-operations-slice7"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The second person's decision on a refund request. The server refuses the requester. */
export function RefundDecisionButtons({ refundId }: { refundId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  function run(action: () => Promise<{ success: true } | { success: false; error: string }>) {
    start(async () => {
      setError("")
      const result = await action()
      if (!result.success) return setError(result.error)
      setMode("idle")
      router.refresh()
    })
  }

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode("approve")}><Check className="mr-1 h-4 w-4" />Approve</Button>
        <Button size="sm" variant="outline" onClick={() => setMode("reject")}><X className="mr-1 h-4 w-4" />Reject</Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      {mode === "approve" ? (
        <p className="text-sm">Approving sends this full refund to Paystack now. It cannot be withdrawn afterwards.</p>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`reject-${refundId}`}>Why is it rejected?</Label>
          <Input id={`reject-${refundId}`} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        {mode === "approve" ? (
          <Button size="sm" variant="destructive" disabled={pending}
            onClick={() => run(() => approveGatewayRefund({ refundId, confirmation: true }))}>
            {pending ? "Submitting…" : "Approve and submit refund"}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={pending || reason.trim().length < 5}
            onClick={() => run(() => rejectGatewayRefund({ refundId, reason }))}>
            {pending ? "Rejecting…" : "Reject request"}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { setMode("idle"); setError("") }}>Cancel</Button>
      </div>
    </div>
  )
}
