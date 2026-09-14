import { Suspense } from "react"
import { SchoolSettingsOverview } from "@/components/school-settings-management/school-settings-overview"
import { getSchoolSettingsData } from "@/app/actions/school-settings"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function SchoolSettingsPage() {
  await requireAdminSchool("school.manage")

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

  if (!settingsData.success || !settingsData.data) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Failed to load school settings</p>
      </div>
    )
  }

  return <SchoolSettingsOverview data={settingsData.data} />
}
