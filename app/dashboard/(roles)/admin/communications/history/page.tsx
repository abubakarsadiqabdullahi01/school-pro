import Link from "next/link"
import { redirect } from "next/navigation"
import { Search } from "lucide-react"

import { getNotificationHistory } from "@/app/actions/communications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { CommunicationsNav } from "@/components/notifications/communications-nav"
import { MessageHistoryList } from "@/components/notifications/message-history-list"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Message history" }
export const dynamic = "force-dynamic"


export default async function MessageHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePermission("school.manage").catch(() => null)
  if (!actor) redirect("/dashboard")
  const params = await searchParams
  const result = await getNotificationHistory({
    status: params.status || undefined, channel: params.channel || undefined, templateKey: params.category || undefined,
    query: params.q || undefined, page: params.page ?? 1,
  })
  const link = (next: Record<string, string | undefined>) => {
    const merged = { ...params, ...next }
    const query = new URLSearchParams(Object.entries(merged).filter(([, value]) => value) as Array<[string, string]>).toString()
    return `/dashboard/admin/communications/history${query ? `?${query}` : ""}`
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Message History</h1>
            <InfoGuide guideKey="communications.history" />
          </div>
          <p className="text-muted-foreground">Every SMS and email the school has sent, with its delivery status and the reason for any failure.</p>
          <CommunicationsNav active="/dashboard/admin/communications/history" />
        </div>

        {!result.success ? <p className="text-destructive" role="alert">{result.error}</p> : (<>
          {result.data.usingLogFallback && (
            <p className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              No SMS/email provider is configured on this server. Messages wait in the queue and are not delivered until one is.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>SMS sent this month</CardDescription><CardTitle>{result.data.month.smsSent}</CardTitle><CardDescription>{result.data.month.smsUnits} unit(s){result.data.month.smsMonthlyLimit !== null ? ` of ${result.data.month.smsMonthlyLimit}` : ""}</CardDescription></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Emails sent this month</CardDescription><CardTitle>{result.data.month.emailSent}</CardTitle><CardDescription>{result.data.month.emailDelivered} confirmed delivered</CardDescription></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Failed this month</CardDescription><CardTitle className={result.data.month.smsFailed + result.data.month.emailFailed ? "text-destructive" : ""}>{result.data.month.smsFailed + result.data.month.emailFailed}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Waiting to send</CardDescription><CardTitle>{result.data.month.waiting}</CardTitle></CardHeader></Card>
          </div>

          <div className="space-y-3">
            <form className="flex w-full gap-2 sm:max-w-md" action="/dashboard/admin/communications/history">
              <Input name="q" defaultValue={params.q} placeholder="Phone, email or text" className="min-w-0 flex-1" aria-label="Search messages" />
              <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
            </form>
            {/* One row each, scrolling sideways on a phone rather than wrapping into a wall of buttons. */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["", "FAILED", "QUEUED", "SENT", "DELIVERED"] as const).map((status) => (
                <Button key={status || "all"} asChild size="sm" className="shrink-0" variant={(params.status ?? "") === status ? "secondary" : "outline"}>
                  <Link href={link({ status: status || undefined, page: undefined })}>{status ? status.toLowerCase() : "all"}</Link>
                </Button>
              ))}
              <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
              {(["", "SMS", "EMAIL"] as const).map((channel) => (
                <Button key={channel || "both"} asChild size="sm" className="shrink-0" variant={(params.channel ?? "") === channel ? "secondary" : "outline"}>
                  <Link href={link({ channel: channel || undefined, page: undefined })}>{channel || "SMS + email"}</Link>
                </Button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Tap a message to see all of it, what happened to it, and what to do if it did not go.</p>
          <MessageHistoryList rows={result.data.rows} />
          {result.data.pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Page {result.data.page} of {result.data.pages} · {result.data.total} message(s)</span>
              <div className="flex gap-2">
                {result.data.page > 1 && <Button asChild size="sm" variant="outline"><Link href={link({ page: String(result.data.page - 1) })}>Previous</Link></Button>}
                {result.data.page < result.data.pages && <Button asChild size="sm" variant="outline"><Link href={link({ page: String(result.data.page + 1) })}>Next</Link></Button>}
              </div>
            </div>
          )}
        </>)}
      </div>
    </PageTransition>
  )
}
