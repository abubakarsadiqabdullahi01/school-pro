"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Clock, Info, Mail, MessageSquare, RotateCcw, XCircle } from "lucide-react"
import { toast } from "sonner"

import { cancelNotification, retryNotification } from "@/app/actions/communications"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { explainDeliveryNote, providerScheduledFor, type DeliveryNote } from "@/lib/notifications/delivery-notes"

export type MessageHistoryRow = {
  id: string
  channel: "SMS" | "EMAIL"
  recipient: string
  subject: string | null
  body: string
  templateKey: string | null
  status: string
  attempts: number
  maxAttempts: number
  units: number
  lastError: string | null
  provider: string | null
  providerMessageId: string | null
  createdAt: string
  sentAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  availableAt: string
}

const CATEGORY: Record<string, string> = {
  "results.published": "Term results",
  "results.annual": "Annual results",
  "fees.reminder": "Fee reminder",
  "payment.received": "Receipt",
  "payment.refunded": "Refund notice",
  announcement: "Announcement",
}

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  delivered: "default", sent: "secondary", scheduled: "secondary", queued: "outline", sending: "outline", failed: "destructive", cancelled: "outline",
}

const NOTE_STYLE: Record<DeliveryNote["tone"], { box: string; text: string; Icon: typeof Info }> = {
  info: { box: "border-sky-500/40 bg-sky-50 dark:bg-sky-950/30", text: "text-sky-800 dark:text-sky-200", Icon: Info },
  warning: { box: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30", text: "text-amber-800 dark:text-amber-200", Icon: AlertTriangle },
  error: { box: "border-destructive/40 bg-destructive/5", text: "text-destructive", Icon: XCircle },
}

function category(row: MessageHistoryRow) {
  return CATEGORY[row.templateKey ?? ""] ?? row.templateKey ?? "Message"
}

/**
 * What the list says a message's state is. A message SmartSMS accepted for later delivery is
 * "scheduled", including ones an earlier version recorded as failed: it is on its way.
 */
function displayStatus(row: MessageHistoryRow): string {
  if ((row.status === "FAILED" || row.status === "SENT") && providerScheduledFor(row.lastError)) return "scheduled"
  return row.status.toLowerCase()
}

function when(value: string | null, style: "short" | "long" = "long") {
  if (!value) return null
  return new Date(value).toLocaleString("en-NG", style === "short"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { dateStyle: "medium", timeStyle: "short" })
}

/**
 * The school's sent messages as a list a bursar can scan on a phone, and the whole of any one
 * of them a tap away: its full text, what happened to it and when, and in plain words what the
 * provider said and what to do about it.
 */
export function MessageHistoryList({ rows }: { rows: MessageHistoryRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = rows.find((row) => row.id === openId) ?? null

  if (rows.length === 0) {
    return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No messages match.</p>
  }

  return (
    <>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((row) => {
          const status = displayStatus(row)
          const note = explainDeliveryNote(row.lastError, row.status)
          const style = note ? NOTE_STYLE[note.tone] : null
          const ChannelIcon = row.channel === "SMS" ? MessageSquare : Mail
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
                  <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="max-w-full truncate text-sm font-medium">{row.recipient}</span>
                    <span className="text-xs text-muted-foreground">{row.channel === "SMS" ? "SMS" : "Email"} · {category(row)}</span>
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{row.subject ?? row.body}</span>
                  {note && style && (
                    <span className={`flex items-center gap-1 text-xs ${style.text}`}>
                      <style.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{note.summary}</span>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={STATUS_TONE[status] ?? "outline"}>{status}</Badge>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{when(row.createdAt, "short")}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Sheet open={open !== null} onOpenChange={(value) => { if (!value) setOpenId(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && <MessageDetails row={open} onDone={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </>
  )
}

function MessageDetails({ row, onDone }: { row: MessageHistoryRow; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const status = displayStatus(row)
  const note = explainDeliveryNote(row.lastError, row.status)
  const style = note ? NOTE_STYLE[note.tone] : null
  const scheduled = status === "scheduled"

  const run = (action: () => Promise<{ success: true } | { success: false; error: string }>, done: string) =>
    start(async () => {
      const result = await action()
      if (!result.success) return void toast.error(result.error)
      toast.success(done)
      onDone()
      router.refresh()
    })

  const timeline = [
    { label: "Queued", at: row.createdAt, Icon: Clock },
    { label: scheduled ? "Accepted by the provider" : "Sent", at: row.sentAt, Icon: CheckCircle2 },
    { label: "Delivered", at: row.deliveredAt, Icon: CheckCircle2 },
    { label: "Failed", at: scheduled ? null : row.failedAt, Icon: XCircle },
    {
      label: "Next attempt",
      at: row.status === "QUEUED" && new Date(row.availableAt) > new Date() ? row.availableAt : null,
      Icon: RotateCcw,
    },
  ].filter((step) => step.at)

  return (
    <div className="space-y-5">
      <SheetHeader className="space-y-1 text-left">
        <SheetTitle>{row.channel === "SMS" ? "SMS" : "Email"} · {category(row)}</SheetTitle>
        <SheetDescription className="break-all">{row.recipient}</SheetDescription>
        <div><Badge variant={STATUS_TONE[status] ?? "outline"}>{status}</Badge></div>
      </SheetHeader>

      {note && style && (
        <div className={`space-y-2 rounded-md border p-3 text-sm ${style.box}`}>
          <p className={`flex items-start gap-2 font-medium ${style.text}`}>
            <style.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {note.summary}
          </p>
          <p>{note.advice}</p>
          <p className="break-words text-xs text-muted-foreground">Provider&apos;s words: {row.lastError}</p>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Message</h3>
        {row.subject && <p className="text-sm font-semibold">{row.subject}</p>}
        <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm">{row.body}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">What happened</h3>
        <ol className="space-y-1.5">
          {timeline.map((step) => (
            <li key={step.label} className="flex items-center gap-2 text-sm">
              <step.Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="w-44 shrink-0">{step.label}</span>
              <span className="text-muted-foreground">{when(step.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Details</h3>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          {row.channel === "SMS" && (<><dt className="text-muted-foreground">Units</dt><dd>{row.units}</dd></>)}
          <dt className="text-muted-foreground">Attempts</dt><dd>{row.attempts} of {row.maxAttempts}</dd>
          <dt className="text-muted-foreground">Provider</dt><dd>{row.provider ?? "Not sent yet"}</dd>
          {row.providerMessageId && (<><dt className="text-muted-foreground">Provider reference</dt><dd className="break-all font-mono text-xs">{row.providerMessageId}</dd></>)}
        </dl>
      </section>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {row.status === "FAILED" && !scheduled && (
          <Button disabled={pending} onClick={() => run(() => retryNotification({ id: row.id }), "Queued to try again")}>
            <RotateCcw className="mr-2 h-4 w-4" />Retry
          </Button>
        )}
        {row.status === "QUEUED" && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => cancelNotification({ id: row.id }), "Cancelled")}>
            Cancel message
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>Close</Button>
      </div>
    </div>
  )
}
