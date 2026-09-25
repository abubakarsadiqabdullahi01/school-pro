"use client"

import { useMemo, useState, useTransition } from "react"
import { AlertTriangle, Loader2, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"

import { saveNotificationTemplate } from "@/app/actions/notifications"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { measureSms, toGsmSafe } from "@/lib/notifications/sms-segments"
import { render, validateTemplate, type TemplateKey } from "@/lib/notifications/templates"

/**
 * Editing the words a school sends.
 *
 * Two things make this more than a textarea, and both are about money and privacy rather
 * than typography:
 *
 *  - **The cost of the message is shown while it is being typed.** One curly apostrophe
 *    re-encodes the whole text and roughly halves the characters per segment, so a note
 *    that looks the same costs three times as much. The counter says so as it happens, and
 *    offers to replace the characters responsible.
 *  - **A result can never be written into it.** The variables offered are only the ones
 *    the trigger supplies, and none of them is a mark. That is enforced on save too; this
 *    is the half that makes it visible.
 */

type TemplateRow = {
  templateKey: string
  channel: string
  subject: string | null
  body: string
  isActive: boolean
  isDefault: boolean
  variables: readonly string[]
}

const TITLES: Record<string, string> = {
  "results.published": "A term's results are ready",
  "results.annual": "An annual result is ready",
  "fees.reminder": "Fees are outstanding",
  "payment.received": "A payment was received",
}

/** Sample values, so the preview reads like a real message rather than a form. */
const SAMPLE: Record<string, string> = {
  studentName: "Amina Bello",
  className: "JSS 2A",
  termName: "First Term",
  sessionName: "2025/2026",
  schoolName: "Brightfield College",
  portalLink: "https://school.example/auth/login",
  amount: "NGN 45,000.00",
  balance: "NGN 12,500.00",
  receiptNo: "RCP-2026-0417",
  decision: "Promoted",
}

export function NotificationTemplateEditor({ templates }: { templates: TemplateRow[] }) {
  const keys = useMemo(
    () => [...new Set(templates.map((row) => row.templateKey))],
    [templates],
  )
  const [active, setActive] = useState(keys[0] ?? "")

  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList className="flex-wrap">
        {keys.map((key) => (
          <TabsTrigger key={key} value={key}>
            {TITLES[key] ?? key}
          </TabsTrigger>
        ))}
      </TabsList>

      {keys.map((key) => (
        <TabsContent key={key} value={key} className="space-y-4">
          {templates
            .filter((row) => row.templateKey === key)
            .map((row) => (
              <TemplateForm key={`${row.templateKey}:${row.channel}`} row={row} />
            ))}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function TemplateForm({ row }: { row: TemplateRow }) {
  const [body, setBody] = useState(row.body)
  const [subject, setSubject] = useState(row.subject ?? "")
  const [pending, startTransition] = useTransition()

  const isSms = row.channel === "SMS"
  const measured = measureSms(body)
  const verdict = validateTemplate(body, row.templateKey as TemplateKey, isSms ? "SMS" : "EMAIL")

  const preview = render(body, SAMPLE, row.variables)
  const previewText = preview.ok ? preview.text : null
  const previewCost = previewText ? measureSms(previewText) : null

  function save() {
    startTransition(async () => {
      const result = await saveNotificationTemplate({
        templateKey: row.templateKey,
        channel: row.channel,
        subject: isSms ? null : subject,
        body,
        isActive: true,
      })
      if (!result.success) {
        toast.error("Could not save", { description: result.error })
        return
      }
      toast.success(`${isSms ? "Text" : "Email"} wording saved`)
    })
  }

  function reset() {
    setBody(row.body)
    setSubject(row.subject ?? "")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {isSms ? "Text message" : "Email"}
            </CardTitle>
            <CardDescription>
              {row.isDefault
                ? "Using the built-in wording. Saving makes it this school's own."
                : "This school's own wording."}
            </CardDescription>
          </div>
          {row.isDefault && <Badge variant="outline">Default</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isSms && (
          <div className="space-y-2">
            <Label htmlFor={`subject-${row.templateKey}`}>Subject</Label>
            <Input
              id={`subject-${row.templateKey}`}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`body-${row.templateKey}-${row.channel}`}>Message</Label>
          <Textarea
            id={`body-${row.templateKey}-${row.channel}`}
            rows={isSms ? 3 : 8}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />

          {isSms && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {measured.units} characters · {measured.segments} SMS ·{" "}
                {measured.encoding === "GSM_7BIT" ? "standard" : "unicode"}
              </span>
              {measured.forcedBy && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  &quot;{measured.forcedBy}&quot; is costing you double
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setBody(toGsmSafe(body))}
                  >
                    fix it
                  </Button>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Available here</Label>
          <div className="flex flex-wrap gap-1.5">
            {row.variables.map((variable) => (
              <button
                key={variable}
                type="button"
                className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => setBody((current) => `${current}{{${variable}}}`)}
              >
                {`{{${variable}}}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            No mark, grade or position is available, on purpose. A message says results are
            ready and links to the portal; it never carries the result itself.
          </p>
        </div>

        {previewText && (
          <div className="space-y-1">
            <Label>What a family receives</Label>
            <p className="rounded-md border bg-muted/40 p-3 text-sm">{previewText}</p>
            {isSms && previewCost && (
              <p className="text-xs text-muted-foreground">
                Filled in, this sends as {previewCost.segments} SMS per recipient.
              </p>
            )}
          </div>
        )}

        {!verdict.ok && (
          <ul className="space-y-1 rounded-md border border-destructive/50 p-3 text-sm text-destructive">
            {verdict.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending || !verdict.ok}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save wording
          </Button>
          <Button variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Undo changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
