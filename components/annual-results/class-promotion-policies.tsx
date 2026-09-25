"use client"

import { useEffect, useState, useTransition } from "react"
import { GraduationCap, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  clearClassPromotionPolicy,
  getClassPromotionPolicy,
  saveClassPromotionPolicy,
  type ClassPolicyDetail,
  type ClassPolicyRow,
} from "@/app/actions/annual-results"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

/**
 * Per-class promotion rules.
 *
 * The screen the Word document asked for: somewhere to say, for each class, whether it
 * promotes on the three-term average or on a count of credits. Before this the schema
 * could not express it at all — `TransitionPolicy.schoolId` is `@unique`, one row per
 * school, so JSS3 and SS1 necessarily promoted on the same rules.
 *
 * A class with no override inherits the school default and says so. Nothing here changes
 * how an existing school behaves until somebody deliberately overrides a class.
 */

type NumberField = string

function numberOrNull(value: NumberField): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function ClassPromotionPolicies({ rows }: { rows: ClassPolicyRow[] }) {
  const [selected, setSelected] = useState<string>("")
  const [detail, setDetail] = useState<ClassPolicyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  // Form state, seeded from the resolved policy whenever a class is opened.
  const [requirePublished, setRequirePublished] = useState(false)
  const [useCriteria, setUseCriteria] = useState(true)
  const [minAverage, setMinAverage] = useState<NumberField>("")
  const [minPassed, setMinPassed] = useState<NumberField>("")
  const [minCredits, setMinCredits] = useState<NumberField>("")
  const [creditMark, setCreditMark] = useState<NumberField>("50")
  const [scope, setScope] = useState<"TERM" | "SESSION_AVERAGE">("SESSION_AVERAGE")
  const [coreSubjectIds, setCoreSubjectIds] = useState<string[]>([])
  const [minCore, setMinCore] = useState<NumberField>("")
  const [requireAll, setRequireAll] = useState(false)
  const [allowOverride, setAllowOverride] = useState(true)
  const [graduating, setGraduating] = useState(false)

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void getClassPromotionPolicy(selected).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.success) {
        toast.error("Could not load that class", { description: result.error })
        return
      }
      const { policy } = result.data
      setDetail(result.data)
      setRequirePublished(policy.requireResultsPublished)
      setUseCriteria(policy.usePromotionCriteria)
      setMinAverage(policy.minAverage?.toString() ?? "")
      setMinPassed(policy.minSubjectsPassed?.toString() ?? "")
      setMinCredits(policy.minCreditsRequired?.toString() ?? "")
      setCreditMark(policy.creditMark.toString())
      setScope(policy.evaluationScope)
      setCoreSubjectIds(policy.requiredSubjectIds)
      setMinCore(policy.minCoreSubjectsPassed?.toString() ?? "")
      setRequireAll(policy.requireAllSubjectsEntered)
      setAllowOverride(policy.allowManualOverride)
      setGraduating(policy.isGraduatingClass)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  const noBarSet =
    useCriteria &&
    minAverage.trim() === "" &&
    minPassed.trim() === "" &&
    minCredits.trim() === "" &&
    minCore.trim() === "" &&
    !requireAll

  function save() {
    startTransition(async () => {
      const result = await saveClassPromotionPolicy({
        classId: selected,
        requireResultsPublished: requirePublished,
        usePromotionCriteria: useCriteria,
        minAverage: numberOrNull(minAverage),
        minSubjectsPassed: numberOrNull(minPassed),
        minCreditsRequired: numberOrNull(minCredits),
        creditMark: numberOrNull(creditMark) ?? 50,
        evaluationScope: scope,
        requiredSubjectIds: coreSubjectIds,
        minCoreSubjectsPassed: numberOrNull(minCore),
        requireAllSubjectsEntered: requireAll,
        allowManualOverride: allowOverride,
        isGraduatingClass: graduating,
      })

      if (!result.success) {
        toast.error("Could not save these rules", { description: result.error })
        return
      }
      toast.success(`Promotion rules saved for ${detail?.className ?? "that class"}`)
      window.location.reload()
    })
  }

  function reset() {
    startTransition(async () => {
      const result = await clearClassPromotionPolicy(selected)
      if (!result.success) {
        toast.error("Could not reset", { description: result.error })
        return
      }
      toast.success("Returned to the school default")
      window.location.reload()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>How each class promotes</CardTitle>
          <CardDescription>
            A class with no rules of its own follows the school default. Overriding one
            changes nothing about any other class.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li
                key={row.classId}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.className}</span>
                    {row.hasOverride ? (
                      <Badge variant="secondary">Own rules</Badge>
                    ) : (
                      <Badge variant="outline">School default</Badge>
                    )}
                    {row.isGraduatingClass && (
                      <Badge variant="outline" className="gap-1">
                        <GraduationCap className="h-3 w-3" /> Final year
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{row.summary}</p>
                </div>
                <Button
                  variant={selected === row.classId ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelected(row.classId)}
                >
                  {selected === row.classId ? "Editing" : "Edit"}
                </Button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">
                No classes yet. Create one before setting promotion rules.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {detail && !loading && (
        <Card>
          <CardHeader>
            <CardTitle>{detail.className}</CardTitle>
            <CardDescription>
              {detail.hasOverride
                ? "This class has its own rules. Reset it to follow the school default again."
                : "Showing the school default. Saving will give this class rules of its own."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="class-require-published">Results must be released first</Label>
                <p className="text-sm text-muted-foreground">
                  Refuses to decide an outcome while any mark is still unpublished.
                </p>
              </div>
              <Switch
                id="class-require-published"
                checked={requirePublished}
                onCheckedChange={setRequirePublished}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="class-graduating">Final year</Label>
                <p className="text-sm text-muted-foreground">
                  SS3, or Primary 6. Learners who clear the bar <strong>graduate</strong>{" "}
                  rather than being promoted. The bar still applies — to let everybody
                  through regardless, turn the academic bar off below.
                </p>
              </div>
              <Switch id="class-graduating" checked={graduating} onCheckedChange={setGraduating} />
            </div>

            <div className="space-y-4 rounded-md border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="class-use-criteria">Apply an academic bar</Label>
                  <p className="text-sm text-muted-foreground">
                    Every minimum set below must be met.
                  </p>
                </div>
                <Switch
                  id="class-use-criteria"
                  checked={useCriteria}
                  onCheckedChange={setUseCriteria}
                />
              </div>

              {useCriteria && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="class-scope">Judged on</Label>
                    <Select
                      value={scope}
                      onValueChange={(value) => setScope(value as typeof scope)}
                    >
                      <SelectTrigger id="class-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SESSION_AVERAGE">
                          Session average — all three terms
                        </SelectItem>
                        <SelectItem value="TERM">The final term only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="class-min-average">Minimum average (%)</Label>
                      <Input
                        id="class-min-average"
                        inputMode="decimal"
                        value={minAverage}
                        onChange={(event) => setMinAverage(event.target.value)}
                        placeholder="Leave blank to skip"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class-min-passed">Minimum subjects passed</Label>
                      <Input
                        id="class-min-passed"
                        inputMode="numeric"
                        value={minPassed}
                        onChange={(event) => setMinPassed(event.target.value)}
                        placeholder="Leave blank to skip"
                      />
                      <p className="text-xs text-muted-foreground">
                        Counted against the grading system&apos;s pass mark.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="class-min-credits">Minimum credits</Label>
                      <Input
                        id="class-min-credits"
                        inputMode="numeric"
                        value={minCredits}
                        onChange={(event) => setMinCredits(event.target.value)}
                        placeholder="Leave blank to skip"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class-credit-mark">A credit is a score of (%)</Label>
                      <Input
                        id="class-credit-mark"
                        inputMode="decimal"
                        value={creditMark}
                        onChange={(event) => setCreditMark(event.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      A credit is stricter than a pass. With a pass mark of 40, a subject
                      scored 45 is a pass and is <strong>not</strong> a credit — which is
                      the distinction this rule exists to make.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Core subjects</Label>
                    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                      {detail.subjects.map((subject) => (
                        <label key={subject.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={coreSubjectIds.includes(subject.id)}
                            onCheckedChange={(checked) =>
                              setCoreSubjectIds((current) =>
                                checked
                                  ? [...current, subject.id]
                                  : current.filter((id) => id !== subject.id),
                              )
                            }
                          />
                          {subject.name}
                        </label>
                      ))}
                      {detail.subjects.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          This class offers no subjects yet.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class-min-core">Minimum core subjects passed</Label>
                      <Input
                        id="class-min-core"
                        inputMode="numeric"
                        value={minCore}
                        onChange={(event) => setMinCore(event.target.value)}
                        placeholder="Leave blank to skip"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={requireAll}
                      onCheckedChange={(checked) => setRequireAll(checked === true)}
                    />
                    Refuse an outcome while any offered subject has no result
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="class-allow-override">Allow manual override</Label>
                <p className="text-sm text-muted-foreground">
                  Whether a decision may be changed by hand against what the rules say. Every
                  override is recorded with its reason.
                </p>
              </div>
              <Switch
                id="class-allow-override"
                checked={allowOverride}
                onCheckedChange={setAllowOverride}
              />
            </div>

            {noBarSet && (
              <p className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
                The academic bar is on but nothing is set, which would promote everybody. Set
                a minimum, or turn the bar off.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={pending || noBarSet}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save rules for {detail.className}
              </Button>
              {detail.hasOverride && (
                <Button variant="outline" onClick={reset} disabled={pending}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Follow the school default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
