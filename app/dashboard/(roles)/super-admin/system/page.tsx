import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SystemSettings } from "@/components/system/system-settings"
import { PageTransition } from "@/components/dashboard/page-transition"
import {
  getBackupStatus,
  getSystemHealth,
  getSystemSettings,
} from "@/app/actions/system-settings"

export default async function SystemSettingsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const [settings, health, backup] = await Promise.all([
    getSystemSettings(),
    getSystemHealth(),
    getBackupStatus(),
  ])

  return (
    <PageTransition>
      <SystemSettings
        settings={settings.success ? settings.data : {}}
        health={health.success ? health.data : null}
        backup={backup.success ? backup.data : null}
      />
    </PageTransition>
  )
}
