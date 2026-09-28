"use client"

import { AlertTriangle, Loader2, Send } from "lucide-react"

import type { CampaignPreview } from "@/app/actions/communications"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export type Channel = "SMS" | "EMAIL"

export function ChannelPicker({ channels, onChange }: { channels: Channel[]; onChange: (next: Channel[]) => void }) {
  const toggle = (channel: Channel, on: boolean) => onChange(on ? [...new Set([...channels, channel])] : channels.filter((c) => c !== channel))
  return (
    <div className="flex flex-wrap gap-6">
      {(["SMS", "EMAIL"] as const).map((channel) => (
        <label key={channel} className="flex items-center gap-2 text-sm">
          <Checkbox checked={channels.includes(channel)} onCheckedChange={(value) => toggle(channel, value === true)} />
          {channel === "SMS" ? "Text message (SMS)" : "Email"}
        </label>
      ))}
    </div>
  )
}

function Figure({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Warning({ tone = "amber", children }: { tone?: "amber" | "red"; children: React.ReactNode }) {
  const style = tone === "red"
    ? "border-destructive/50 text-destructive"
    : "border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
  return <p className={`flex items-start gap-2 rounded-md border p-3 text-sm ${style}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></p>
}

/**
 * The step between writing and sending: who it reaches, what it costs, exactly what it
 * says. The send button lives here, so nothing goes out without this having been seen.
 */
export function CampaignPreviewCard({
  preview, audienceLabel, extra, sending, onSend, sendLabel = "Send now",
}: {
  preview: CampaignPreview
  audienceLabel: string
  extra?: React.ReactNode
  sending: boolean
  onSend: () => void
  sendLabel?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Before you send</CardTitle>
        <CardDescription>Nothing has been sent yet. Check the reach, the cost and the wording.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.blockedReason && <Warning tone="red">{preview.blockedReason}</Warning>}
        {preview.usingLogFallback && <Warning>No SMS/email provider is configured on this server, so these messages will wait in the queue and <strong>not be delivered</strong> until one is.</Warning>}
        {preview.overSmsLimit > 0 && <Warning>{preview.overSmsLimit} text message(s) would take the school past its monthly SMS limit and will not be sent. Raise the limit in Notification settings, or send by email.</Warning>}
        {preview.switchedOff > 0 && <Warning>{preview.switchedOff} message(s) are on a channel this school has switched off for this category, and will not be sent.</Warning>}

        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label={audienceLabel} value={preview.audience} />
          <Figure label="People by text" value={preview.smsRecipients} sub={preview.totalSmsSegments > 0 ? `${preview.totalSmsSegments} SMS units (${preview.smsSegmentsEach} each)` : undefined} />
          <Figure label="People by email" value={preview.emailRecipients} />
        </div>
        {extra}

        {preview.sampleMessage && (
          <div className="space-y-2">
            <Label>What the first person receives</Label>
            {preview.sampleEmailSubject && <p className="text-sm"><span className="text-muted-foreground">Email subject:</span> {preview.sampleEmailSubject}</p>}
            <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview.sampleMessage}</p>
          </div>
        )}

        <Button onClick={onSend} disabled={sending || Boolean(preview.blockedReason)}>
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {sendLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

export function describeResult(result: { queued: number; duplicates: number; rejected: string[]; switchedOff: number; overSmsLimit: number }): string {
  const parts = [`${result.queued} message(s) queued`]
  if (result.duplicates) parts.push(`${result.duplicates} already sent before`)
  if (result.rejected.length) parts.push(`${result.rejected.length} unusable address(es)`)
  if (result.switchedOff) parts.push(`${result.switchedOff} switched off`)
  if (result.overSmsLimit) parts.push(`${result.overSmsLimit} over the SMS limit`)
  return parts.join(" · ")
}
