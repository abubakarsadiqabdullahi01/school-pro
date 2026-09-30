"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { retryParkedGatewayEvent, settleParkedGatewayEvent } from "@/app/actions/payment-pilot"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * What a person can do with a parked webhook event: try it once more now that the cause is
 * fixed, or close it as dealt with by hand. Neither posts money by itself.
 */
export function ParkedEventActions({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<"idle" | "settle">("idle")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  if (mode === "settle") {
    return (
      <div className="space-y-2">
        <Label htmlFor={`settle-${eventId}`}>What was done?</Label>
        <Input
          id={`settle-${eventId}`}
          value={note}
          maxLength={500}
          placeholder="e.g. Credited to JSS2 Ada Obi at the counter, receipt RCT-0142"
          onChange={(event) => setNote(event.target.value)}
        />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={pending || note.trim().length < 10} onClick={() => start(async () => {
            setError("")
            const result = await settleParkedGatewayEvent({ eventId, note, confirmation: true })
            if (!result.success) return setError(result.error)
            toast.success("Event closed as settled by hand")
            router.refresh()
          })}>Close as settled</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Try again only if nobody has credited this by hand; if someone has, close it as settled instead.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
          setError("")
          const result = await retryParkedGatewayEvent({ eventId, confirmation: true })
          if (!result.success) return setError(result.error)
          if (result.data.result === "failed") toast.error("It failed again and is parked with the new error")
          else toast.success(`Retried: ${result.data.result.replaceAll("_", " ")}`)
          router.refresh()
        })}>Try again now</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("settle")}>Settled by hand</Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}
