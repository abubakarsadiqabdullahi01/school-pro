"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { saveTransitionPolicy } from "@/app/actions/student-transitions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export type PromotionPolicyValues = {
  requireResultsPublished: boolean
  usePromotionCriteria: boolean
  minAverage: number | null
  minSubjectsPassed: number | null
}

/**
 * The school's promotion rules, switched on or off independently.
 *
 * Both default to off, and the copy says plainly what each does, because turning one on
 * changes whether a child is held back — not something an admin should discover by
 * experiment.
 *
 * Neither rule applies to transfers or withdrawals: those are not judgements on results.
 */
export function PromotionPolicyForm({ policy }: { policy: PromotionPolicyValues }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [requirePublished, setRequirePublished] = useState(policy.requireResultsPublished)
  const [useCriteria, setUseCriteria] = useState(policy.usePromotionCriteria)
  const [minAverage, setMinAverage] = useState(policy.minAverage?.toString() ?? "")
  const [minPassed, setMinPassed] = useState(policy.minSubjectsPassed?.toString() ?? "")

  function save() {
    startTransition(async () => {
      const result = await saveTransitionPolicy({
        requireResultsPublished: requirePublished,
        usePromotionCriteria: useCriteria,
        minAverage: minAverage.trim() === "" ? null : Number(minAverage),
        minSubjectsPassed: minPassed.trim() === "" ? null : Number(minPassed),
      })

      if (!result.success) {
        toast.error("Could not save the promotion rules", { description: result.error })
        return
      }
      toast.success("Promotion rules saved")
      router.refresh()
    })
  }

  const noBarSet = useCriteria && minAverage.trim() === "" && minPassed.trim() === ""

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          Promotion Rules
        </CardTitle>
        <CardDescription>
          Both are off unless you turn them on, and neither affects transfers or withdrawals. An admin can still
          override a blocked promotion — the override is recorded against the transition.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-md border p-4">
          <div className="space-y-1">
            <Label htmlFor="requirePublished">Results must be published first</Label>
            <p className="text-sm text-muted-foreground">
              Refuses to promote out of a term whose results have not been released. Stops a class being moved up
              before anyone has seen the marks.
            </p>
          </div>
          <Switch id="requirePublished" checked={requirePublished} onCheckedChange={setRequirePublished} />
        </div>

        <div className="rounded-md border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="useCriteria">Apply an academic bar</Label>
              <p className="text-sm text-muted-foreground">
                Refuses to promote a student who missed the mark. Set an average, a number of subjects passed, or
                both — both must be met.
              </p>
            </div>
            <Switch id="useCriteria" checked={useCriteria} onCheckedChange={setUseCriteria} />
          </div>

          {useCriteria && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="minAverage">Minimum average (%)</Label>
                <Input
                  id="minAverage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={minAverage}
                  onChange={(event) => setMinAverage(event.target.value)}
                  placeholder="Leave blank to not test the average"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minPassed">Minimum subjects passed</Label>
                <Input
                  id="minPassed"
                  type="number"
                  min="0"
                  step="1"
                  value={minPassed}
                  onChange={(event) => setMinPassed(event.target.value)}
                  placeholder="Leave blank to not count subjects"
                />
                <p className="text-xs text-muted-foreground">
                  Counted against the grading system&apos;s pass mark.
                </p>
              </div>
            </div>
          )}

          {noBarSet && (
            <p className="mt-3 text-sm text-destructive">
              Set an average or a number of subjects — a bar with neither would pass everyone.
            </p>
          )}
        </div>

        <Button onClick={save} disabled={isPending || noBarSet}>Save Promotion Rules</Button>
      </CardContent>
    </Card>
  )
}
