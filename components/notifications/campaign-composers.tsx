"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  cancelAnnouncement,
  previewAnnouncement,
  previewAnnualNotice,
  previewFeeReminder,
  sendAnnouncement,
  sendAnnualNotice,
  sendFeeReminder,
  type CampaignPreview,
} from "@/app/actions/communications"
import { CampaignPreviewCard, ChannelPicker, describeResult, type Channel } from "@/components/notifications/campaign-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Option = { id: string; name: string }

function PreviewButton({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Preview
    </Button>
  )
}

// ---------------------------------------------------------------------------------------

export function AnnouncementComposer({ classes }: { classes: Option[] }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState<"ALL_PARENTS" | "CLASS_PARENTS" | "STAFF">("ALL_PARENTS")
  const [classIds, setClassIds] = useState<string[]>([])
  const [channels, setChannels] = useState<Channel[]>(["SMS", "EMAIL"])
  const [scheduledFor, setScheduledFor] = useState("")
  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [pending, start] = useTransition()

  const input = () => ({ title, message, audience, classIds, channels, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null })
  const changed = () => setPreview(null)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New announcement</CardTitle>
          <CardDescription>Sent under the school&apos;s name. Keep SMS short: every 160 characters is another unit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title">Title</Label>
            <Input id="announcement-title" value={title} maxLength={150} placeholder="e.g. Mid-term break" onChange={(e) => { setTitle(e.target.value); changed() }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="announcement-message">Message</Label>
            <Textarea id="announcement-message" value={message} maxLength={2000} rows={5}
              placeholder="e.g. School closes on Friday 17 October and resumes on Monday 27 October."
              onChange={(e) => { setMessage(e.target.value); changed() }} />
            <p className="text-xs text-muted-foreground">{message.length} characters</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Who receives it</Label>
              <Select value={audience} onValueChange={(value) => { setAudience(value as typeof audience); changed() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_PARENTS">All parents and guardians</SelectItem>
                  <SelectItem value="CLASS_PARENTS">Parents of selected classes</SelectItem>
                  <SelectItem value="STAFF">All staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="announcement-when">Send at (optional)</Label>
              <Input id="announcement-when" type="datetime-local" value={scheduledFor} onChange={(e) => { setScheduledFor(e.target.value); changed() }} />
            </div>
          </div>
          {audience === "CLASS_PARENTS" && (
            <div className="flex flex-wrap gap-4 rounded-md border p-3">
              {classes.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={classIds.includes(option.id)} onCheckedChange={(value) => {
                    setClassIds(value === true ? [...classIds, option.id] : classIds.filter((id) => id !== option.id)); changed()
                  }} />{option.name}
                </label>
              ))}
            </div>
          )}
          <ChannelPicker channels={channels} onChange={(next) => { setChannels(next); changed() }} />
          <PreviewButton pending={pending} onClick={() => start(async () => {
            const result = await previewAnnouncement(input())
            if (!result.success) return void toast.error(result.error)
            setPreview(result.data)
          })} />
        </CardContent>
      </Card>
      {preview && (
        <CampaignPreviewCard preview={preview} audienceLabel="People reached" sending={pending}
          sendLabel={scheduledFor ? "Schedule announcement" : "Send announcement"}
          onSend={() => start(async () => {
            const result = await sendAnnouncement(input())
            if (!result.success) return void toast.error(result.error)
            toast.success(describeResult(result.data))
            setPreview(null); setTitle(""); setMessage(""); setScheduledFor("")
            router.refresh()
          })} />
      )}
    </div>
  )
}

export function WithdrawAnnouncementButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      const result = await cancelAnnouncement({ id })
      if (!result.success) return void toast.error(result.error)
      toast.success(`${result.data.cancelled} unsent message(s) cancelled`)
      router.refresh()
    })}>Withdraw</Button>
  )
}

// ---------------------------------------------------------------------------------------

export function FeeReminderComposer({ classes }: { classes: Option[] }) {
  const [classId, setClassId] = useState("all")
  const [minBalance, setMinBalance] = useState("1000")
  const [channels, setChannels] = useState<Channel[]>(["SMS", "EMAIL"])
  const [preview, setPreview] = useState<(CampaignPreview & { totalOwing: string }) | null>(null)
  const [pending, start] = useTransition()
  const input = () => ({ classId: classId === "all" ? null : classId, minBalance: Number(minBalance) || 0, channels })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Remind families who owe</CardTitle>
          <CardDescription>Each family is reminded at most once a day, and never told a child&apos;s balance through anyone but their own guardians.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(value) => { setClassId(value); setPreview(null) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-min">Only if owing at least (₦)</Label>
              <Input id="reminder-min" type="number" inputMode="decimal" min={0} value={minBalance} onChange={(e) => { setMinBalance(e.target.value); setPreview(null) }} />
            </div>
          </div>
          <ChannelPicker channels={channels} onChange={(next) => { setChannels(next); setPreview(null) }} />
          <PreviewButton pending={pending} onClick={() => start(async () => {
            const result = await previewFeeReminder(input())
            if (!result.success) return void toast.error(result.error)
            setPreview(result.data)
          })} />
        </CardContent>
      </Card>
      {preview && (
        <CampaignPreviewCard preview={preview} audienceLabel="Learners owing" sending={pending} sendLabel="Send reminders"
          extra={<p className="text-sm">Total outstanding across these learners: <strong>{preview.totalOwing}</strong></p>}
          onSend={() => start(async () => {
            const result = await sendFeeReminder(input())
            if (!result.success) return void toast.error(result.error)
            toast.success(describeResult(result.data))
            setPreview(null)
          })} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------

export function AnnualNoticeComposer({ classes, sessions }: { classes: Option[]; sessions: Option[] }) {
  const [classId, setClassId] = useState("")
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "")
  const [channels, setChannels] = useState<Channel[]>(["SMS", "EMAIL"])
  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [pending, start] = useTransition()
  const input = () => ({ classId, sessionId, channels })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Annual (end-of-session) results</CardTitle>
          <CardDescription>Allowed once every term of the session is published for the class. Results are never put in the message.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Session</Label>
              <Select value={sessionId} onValueChange={(value) => { setSessionId(value); setPreview(null) }}>
                <SelectTrigger><SelectValue placeholder="Choose a session" /></SelectTrigger>
                <SelectContent>{sessions.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(value) => { setClassId(value); setPreview(null) }}>
                <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
                <SelectContent>{classes.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <ChannelPicker channels={channels} onChange={(next) => { setChannels(next); setPreview(null) }} />
          <PreviewButton pending={pending || !classId || !sessionId} onClick={() => start(async () => {
            const result = await previewAnnualNotice(input())
            if (!result.success) return void toast.error(result.error)
            setPreview(result.data)
          })} />
        </CardContent>
      </Card>
      {preview && (
        <CampaignPreviewCard preview={preview} audienceLabel="Learners" sending={pending} sendLabel="Send annual notice"
          onSend={() => start(async () => {
            const result = await sendAnnualNotice(input())
            if (!result.success) return void toast.error(result.error)
            toast.success(describeResult(result.data))
            setPreview(null)
          })} />
      )}
    </div>
  )
}

export function AnnouncementStatus({ status, scheduledFor }: { status: string; scheduledFor: string | null }) {
  if (status === "CANCELLED") return <Badge variant="secondary">Withdrawn</Badge>
  if (scheduledFor && new Date(scheduledFor) > new Date()) return <Badge variant="outline">Scheduled</Badge>
  return <Badge>Sent</Badge>
}
