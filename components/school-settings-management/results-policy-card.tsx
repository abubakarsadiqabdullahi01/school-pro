"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { updateResultsPolicy } from "@/app/actions/school-settings"

/**
 * The one switch that decides whether unpaid fees hide a term's results.
 *
 * Off by default, because that is how the portals behaved before the setting existed and a
 * school upgrading must not find its parents locked out overnight.
 */
export function ResultsPolicyCard({ withholdResultsWhenOwing }: { withholdResultsWhenOwing: boolean }) {
  const [enabled, setEnabled] = useState(withholdResultsWhenOwing)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(next: boolean) {
    const previous = enabled
    setEnabled(next)

    startTransition(async () => {
      const result = await updateResultsPolicy(next)
      if (result.success) {
        toast.success("Saved", { description: result.message })
        router.refresh()
      } else {
        // Put the switch back rather than leaving it showing a state the server rejected.
        setEnabled(previous)
        toast.error("Not saved", { description: result.error })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Results and unpaid fees</CardTitle>
        </div>
        <CardDescription>
          What parents and students see in the portal when a term has not been paid for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="withhold-results" className="text-base">
              Hold results while fees are unpaid
            </Label>
            <p className="text-sm text-muted-foreground">
              When on, a term&apos;s results are hidden from the parent and student portals
              while that term still has an outstanding balance, with a message asking them to
              contact the bursar.
            </p>
          </div>
          <Switch
            id="withhold-results"
            checked={enabled}
            disabled={isPending}
            onCheckedChange={handleChange}
          />
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            This is per term, not per account. A family that owes for this term keeps last
            year&apos;s results — the school withholds what has not been paid for, not the
            child&apos;s history. A session summary needs every term in it, so it is held
            while any one of its terms is.
            <br />
            <br />
            Staff screens are unaffected: teachers and administrators always see marks. This
            changes only what families are shown.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
