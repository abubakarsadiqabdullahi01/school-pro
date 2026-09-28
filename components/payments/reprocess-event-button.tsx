"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCw } from "lucide-react"
import { toast } from "sonner"

import { reprocessGatewayEvent } from "@/app/actions/gateway-operations"
import { Button } from "@/components/ui/button"

export function ReprocessEventButton({ transactionId, eventId }: { transactionId: string; eventId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        <RotateCw className="mr-2 h-4 w-4" /> Reprocess
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Confirm event reprocessing">
      <span className="text-xs text-muted-foreground">Verify with Paystack and retry this event?</span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await reprocessGatewayEvent({ transactionId, eventId, confirmation: true })
          if (!result.success) {
            toast.error("Event was not reprocessed", { description: result.error })
            return
          }
          toast.success("Gateway event processed", { description: result.data.result.replaceAll("_", " ") })
          setConfirming(false)
          router.refresh()
        })}
      >
        {pending ? "Checking…" : "Confirm retry"}
      </Button>
    </div>
  )
}
