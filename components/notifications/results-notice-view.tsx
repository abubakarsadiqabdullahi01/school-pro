"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import {
  previewResultsNotice,
  sendResultsNotice,
  type NoticePreview,
} from "@/app/actions/notifications"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Telling families that results are out.
 *
 * The screen is built around one rule: **nothing is sent until somebody has seen what it
 * will cost.** A mis-click that texts four hundred parents is real money, so previewing is
 * a separate, unmissable step, and the send button does not appear until it has run.
 *
 * It also shows who *cannot* be reached. A school that thinks it told everybody, and in
 * fact told two hundred and eighty of three hundred and twelve, has a worse problem than
 * one that knows.
 */

type ClassTermOption = { id: string; label: string }

export function ResultsNoticeView({ classTerms }: { classTerms: ClassTermOption[] }) {
  const [classTermId, setClassTermId] = useState("")
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(true)
  const [preview, setPreview] = useState<NoticePreview | null>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<"preview" | "send" | null>(null)

  const channels = [...(sms ? (["SMS"] as const) : []), ...(email ? (["EMAIL"] as const) : [])]

  function runPreview() {
    if (!classTermId) {
      toast.error("Choose a class first")
      return
    }
    if (channels.length === 0) {
      toast.error("Choose at least one channel")
      return
    }

    setBusy("preview")
    startTransition(async () => {
      const result = await previewResultsNotice({ classTermId, channels })
      setBusy(null)
      if (!result.success) {
        setPreview(null)
        toast.error("Could not work that out", { description: result.error })
        return
      }
      setPreview(result.data)
    })
  }

  function send() {
    setBusy("send")
    startTransition(async () => {
      const result = await sendResultsNotice({ classTermId, channels })
      setBusy(null)
      if (!result.success) {
        toast.error("Could not queue those notices", { description: result.error })
        return
      }

      const { queued, duplicates, rejected } = result.data
      toast.success(`Queued ${queued} message(s)`, {
        description:
          [
            duplicates > 0 ? `${duplicates} had already been sent` : null,
            rejected.length > 0 ? `${rejected.length} could not be addressed` : null,
            "They go out on the next sending run.",
          ]
            .filter(Boolean)
            .join(". ") + ".",
      })
      // Re-read, so the counts reflect what is now already sent.
      runPreview()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Who to tell</CardTitle>
          <CardDescription>
            Results themselves are never put in the message. Families are told the results
            are ready and sent to the portal, where they have to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notice-class">Class and term</Label>
            <Select
              value={classTermId}
              onValueChange={(value) => {
                setClassTermId(value)
                setPreview(null)
              }}
            >
              <SelectTrigger id="notice-class">
                <SelectValue placeholder="Select a class term" />
              </SelectTrigger>
              <SelectContent>
                {classTerms.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sms}
                onCheckedChange={(checked) => {
                  setSms(checked === true)
                  setPreview(null)
                }}
              />
              Text message
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={email}
                onCheckedChange={(checked) => {
                  setEmail(checked === true)
                  setPreview(null)
                }}
              />
              Email
            </label>
          </div>

          <Button onClick={runPreview} disabled={pending} variant="outline">
            {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Check who this reaches
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>
              {preview.className} · {preview.termName}
            </CardTitle>
            <CardDescription>
              Nothing has been sent yet. Check the numbers and the wording below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.usingLogFallback && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No sending provider is configured, so these messages will be written to the
                  server log and <strong>not delivered</strong>. Set the provider keys before
                  relying on this.
                </span>
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <Figure label="Learners" value={preview.learners} />
              <Figure
                label="People by text"
                value={sms ? preview.smsRecipients : 0}
                sub={
                  sms && preview.totalSmsSegments > 0
                    ? `${preview.totalSmsSegments} SMS at ${preview.smsSegmentsEach} each`
                    : undefined
                }
              />
              <Figure label="People by email" value={email ? preview.emailRecipients : 0} />
            </div>

            <div className="space-y-2">
              <Label>The message they get</Label>
              <p className="rounded-md border bg-muted/40 p-3 text-sm">{preview.sampleMessage}</p>
            </div>

            {preview.unreachable.length > 0 && (
              <div className="space-y-2">
                <Label className="text-destructive">
                  {preview.unreachable.length} learner(s) nobody can be told about
                </Label>
                <ul className="divide-y rounded-md border text-sm">
                  {preview.unreachable.map((row) => (
                    <li key={row.studentName} className="flex justify-between gap-3 p-2">
                      <span>{row.studentName}</span>
                      <span className="text-muted-foreground">{row.problem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={send} disabled={pending || channels.length === 0}>
                {busy === "send" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send to {sms ? preview.smsRecipients : 0} by text
                {email ? ` and ${preview.emailRecipients} by email` : ""}
              </Button>
              <Badge variant="outline">
                Anyone already told is skipped
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Figure({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
