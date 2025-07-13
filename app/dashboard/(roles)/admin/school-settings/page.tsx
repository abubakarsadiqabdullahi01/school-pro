import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SchoolSettingsOverview } from "@/components/school-settings-management/school-settings-overview"
import { getSchoolSettingsData } from "@/app/actions/school-settings"

import { LoadingSpinner } from "@/components/dashboard/loading-spinner"

export default async function SchoolSettingsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">School Settings</h1>
        <p className="text-muted-foreground">Manage your school's configuration and preferences</p>
      </div>

      <Suspense fallback={<LoadingSpinner message="Loading school settings..." />}>
        <SchoolSettingsContent />
      </Suspense>
    </div>
  )
}

async function SchoolSettingsContent() {
  const settingsData = await getSchoolSettingsData()

  if (!settingsData.success) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Failed to load school settings</p>
      </div>
    )
  }

  return <SchoolSettingsOverview data={settingsData.data} />
}
