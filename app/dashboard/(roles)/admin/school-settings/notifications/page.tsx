import { redirect } from "next/navigation"

import { getNotificationSettings } from "@/app/actions/notifications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { NotificationTemplateEditor } from "@/components/notifications/template-editor"
import { Badge } from "@/components/ui/badge"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Notification wording" }

export default async function NotificationSettingsPage() {
  const actor = await requirePermission("school.manage").catch(() => null)
  if (!actor) redirect("/dashboard")

  const result = await getNotificationSettings()

  if (!result.success) {
    return (
      <PageTransition>
        <p className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
          {result.error}
        </p>
      </PageTransition>
    )
  }

  const queued = result.data.queue
    .filter((row) => row.status === "QUEUED")
    .reduce((total, row) => total + row.messages, 0)
  const failed = result.data.queue
    .filter((row) => row.status === "FAILED")
    .reduce((total, row) => total + row.messages, 0)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Notification Wording</h1>
            <InfoGuide guideKey="school.notificationWording" />
          </div>
          <p className="text-muted-foreground">
            What families actually read when the school writes to them. Each message has a
            text and an email version, and a school with no wording of its own uses the
            built-in one.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={queued > 0 ? "secondary" : "outline"}>{queued} waiting to send</Badge>
          {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
          {result.data.usingLogFallback && (
            <Badge variant="destructive">
              No provider configured — messages are not delivered
            </Badge>
          )}
        </div>

        <NotificationTemplateEditor templates={result.data.templates} />
      </div>
    </PageTransition>
  )
}
