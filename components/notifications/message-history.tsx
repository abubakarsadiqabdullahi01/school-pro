"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cancelNotification, retryNotification, saveNotificationControls } from "@/app/actions/communications"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function MessageRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (status === "FAILED") {
    return <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      const result = await retryNotification({ id })
      if (!result.success) return void toast.error(result.error)
      toast.success("Queued to try again"); router.refresh()
    })}>Retry</Button>
  }
  if (status === "QUEUED") {
    return <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
      const result = await cancelNotification({ id })
      if (!result.success) return void toast.error(result.error)
      toast.success("Cancelled"); router.refresh()
    })}>Cancel</Button>
  }
  return null
}

type Category = { key: string; label: string; channels: Array<{ channel: "SMS" | "EMAIL"; enabled: boolean; essential: boolean }> }

/** A school's switches per category and channel, and its monthly SMS budget. */
export function NotificationControls({ categories, smsMonthlyLimit, smsUnitsThisMonth }: {
  categories: Category[]
  smsMonthlyLimit: number | null
  smsUnitsThisMonth: number
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.flatMap((category) => category.channels.map((c) => [`${category.key}:${c.channel}`, c.enabled]))))
  const [limit, setLimit] = useState(smsMonthlyLimit === null ? "" : String(smsMonthlyLimit))
  const [pending, start] = useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What this school sends</CardTitle>
        <CardDescription>
          Switch a message type off per channel, and cap SMS spending. Payment receipts and refund notices by email always go out; they are records, not optional messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40"><th className="p-2 text-left font-medium">Message</th><th className="p-2 font-medium">SMS</th><th className="p-2 font-medium">Email</th></tr></thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.key} className="border-b last:border-0">
                  <td className="p-2">{category.label}</td>
                  {category.channels.map((c) => {
                    const id = `${category.key}:${c.channel}`
                    return (
                      <td key={c.channel} className="p-2 text-center">
                        <Switch aria-label={`${category.label} by ${c.channel}`} checked={c.essential || enabled[id]} disabled={c.essential || pending}
                          onCheckedChange={(value) => setEnabled({ ...enabled, [id]: value })} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56 space-y-1.5">
            <Label htmlFor="sms-limit">Monthly SMS limit (units)</Label>
            <Input id="sms-limit" type="number" min={0} placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <p className="pb-2 text-sm text-muted-foreground">Used this month: {smsUnitsThisMonth} unit(s)</p>
        </div>
        <Button disabled={pending} onClick={() => start(async () => {
          const disabled = Object.entries(enabled).filter(([, on]) => !on).map(([id]) => id)
          const result = await saveNotificationControls({ disabled, smsMonthlyLimit: limit.trim() === "" ? null : Number(limit) })
          if (!result.success) return void toast.error(result.error)
          toast.success("Notification controls saved"); router.refresh()
        })}>Save controls</Button>
      </CardContent>
    </Card>
  )
}
