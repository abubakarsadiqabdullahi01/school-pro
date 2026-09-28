import Link from "next/link"
import { redirect } from "next/navigation"
import { Search } from "lucide-react"

import { getNotificationHistory } from "@/app/actions/communications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { CommunicationsNav } from "@/components/notifications/communications-nav"
import { MessageRowActions } from "@/components/notifications/message-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InfoGuide } from "@/components/ui/info-guide"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Message history" }
export const dynamic = "force-dynamic"

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DELIVERED: "default", SENT: "secondary", QUEUED: "outline", SENDING: "outline", FAILED: "destructive", CANCELLED: "outline",
}
const CATEGORY: Record<string, string> = {
  "results.published": "Term results", "results.annual": "Annual results", "fees.reminder": "Fee reminder",
  "payment.received": "Receipt", "payment.refunded": "Refund", announcement: "Announcement",
}

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

          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-2" action="/dashboard/admin/communications/history">
              <Input name="q" defaultValue={params.q} placeholder="Phone, email or text" className="w-56" aria-label="Search messages" />
              <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
            </form>
            {(["", "FAILED", "QUEUED", "SENT", "DELIVERED"] as const).map((status) => (
              <Button key={status || "all"} asChild size="sm" variant={(params.status ?? "") === status ? "secondary" : "outline"}>
                <Link href={link({ status: status || undefined, page: undefined })}>{status ? status.toLowerCase() : "all"}</Link>
              </Button>
            ))}
            {(["", "SMS", "EMAIL"] as const).map((channel) => (
              <Button key={channel || "both"} asChild size="sm" variant={(params.channel ?? "") === channel ? "secondary" : "outline"}>
                <Link href={link({ channel: channel || undefined, page: undefined })}>{channel || "SMS + email"}</Link>
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>To</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {result.data.rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No messages match.</TableCell></TableRow>
                ) : result.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                    <TableCell className="text-xs">{row.channel}<br /><span className="text-muted-foreground">{CATEGORY[row.templateKey ?? ""] ?? row.templateKey ?? "—"}</span></TableCell>
                    <TableCell className="max-w-44 break-all text-xs">{row.recipient}</TableCell>
                    <TableCell className="max-w-md text-xs"><span className="line-clamp-2">{row.subject ? <strong>{row.subject} — </strong> : null}{row.body}</span>{row.lastError && row.status !== "DELIVERED" && <span className="mt-1 block text-destructive">{row.lastError}</span>}</TableCell>
                    <TableCell><Badge variant={STATUS_TONE[row.status] ?? "outline"}>{row.status.toLowerCase()}</Badge>{row.channel === "SMS" && <span className="block text-xs text-muted-foreground">{row.units} unit(s)</span>}</TableCell>
                    <TableCell className="text-right"><MessageRowActions id={row.id} status={row.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.data.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
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
