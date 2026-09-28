import { redirect } from "next/navigation"

import { getCommunicationOptions, listAnnouncements } from "@/app/actions/communications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { AnnouncementComposer, AnnouncementStatus, WithdrawAnnouncementButton } from "@/components/notifications/campaign-composers"
import { CommunicationsNav } from "@/components/notifications/communications-nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Announcements" }
export const dynamic = "force-dynamic"

const AUDIENCE: Record<string, string> = { ALL_PARENTS: "All parents", CLASS_PARENTS: "Selected classes", STAFF: "Staff" }

export default async function AnnouncementsPage() {
  const actor = await requirePermission("school.manage").catch(() => null)
  if (!actor) redirect("/dashboard")
  const [options, announcements] = await Promise.all([getCommunicationOptions(), listAnnouncements()])

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
            <InfoGuide guideKey="communications.announcements" />
          </div>
          <p className="text-muted-foreground">Tell families or staff something by SMS and email. Nothing is sent until you have seen the reach and the cost.</p>
          <CommunicationsNav active="/dashboard/admin/communications" />
        </div>

        <AnnouncementComposer classes={options.success ? options.data.classes : []} />

        <Card>
          <CardHeader><CardTitle className="text-lg">Recent announcements</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!announcements.success || announcements.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet.</p>
            ) : announcements.data.map((row) => {
              const waiting = row.delivery.QUEUED ?? 0
              return (
                <div key={row.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{row.title} <AnnouncementStatus status={row.status} scheduledFor={row.scheduledFor} /></p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{row.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {AUDIENCE[row.audience]} · {row.channels.join(" + ")} · {new Date(row.scheduledFor ?? row.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                      {" · "}{Object.entries(row.delivery).map(([status, count]) => `${count} ${status.toLowerCase()}`).join(", ") || "no messages"}
                    </p>
                  </div>
                  {row.status !== "CANCELLED" && waiting > 0 && <WithdrawAnnouncementButton id={row.id} />}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  )
}
