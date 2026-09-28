"use client"

import { useState, useTransition } from "react"
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { setSchoolLiveApproval } from "@/app/actions/payment-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * The platform owner's key for one school's live money. Approving is not the same as
 * switching on: the school's own admin still turns LIVE on from its payment settings.
 */
export function LiveApprovalControl({
  configurationId,
  schoolName,
  approvedAt,
  pilotMaxAmount,
}: {
  configurationId: string
  schoolName: string
  approvedAt: string | null
  pilotMaxAmount: string | null
}) {
  const [limit, setLimit] = useState(pilotMaxAmount ?? "10000")
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [pending, startTransition] = useTransition()

  function save(approved: boolean) {
    startTransition(async () => {
      const parsed = limit.trim() === "" ? null : Number(limit)
      if (approved && parsed !== null && !(parsed > 0)) {
        toast.error("Enter a positive pilot limit, or leave it empty for no limit")
        return
      }
      const result = await setSchoolLiveApproval({ configurationId, approved, pilotMaxAmount: parsed, confirmation: true })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setConfirmRevoke(false)
      toast.success(approved ? `${schoolName} is approved for live payments` : `Live payments revoked for ${schoolName}`)
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label htmlFor={`pilot-limit-${configurationId}`}>Pilot limit per payment (₦)</Label>
          <Input
            id={`pilot-limit-${configurationId}`}
            className="mt-1.5"
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            placeholder="No limit"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </div>
        <Button type="button" onClick={() => save(true)} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {approvedAt ? "Update approval" : "Approve for live"}
        </Button>
        {approvedAt && !confirmRevoke && (
          <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)} disabled={pending}>
            <ShieldOff className="mr-2 h-4 w-4" />Revoke
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Leave the limit empty to lift it once the pilot is signed off.</p>
      {confirmRevoke && (
        <div className="space-y-2 rounded-md border border-destructive/30 p-3" role="alert">
          <p className="text-sm">Revoking switches live payments off for {schoolName} immediately. Checkouts already paid still confirm.</p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={() => save(false)} disabled={pending}>Revoke live approval</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRevoke(false)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
