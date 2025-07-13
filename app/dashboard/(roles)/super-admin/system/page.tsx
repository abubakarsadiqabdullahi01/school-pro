import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SystemSettings } from "@/components/system/system-settings"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function SystemSettingsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  return (
    <PageTransition>
      <SystemSettings />
    </PageTransition>
  )
}
