import { Suspense } from "react"
import { SchoolSettingsOverview } from "@/components/school-settings-management/school-settings-overview"
import { getResultsPolicy, getSchoolSettingsData } from "@/app/actions/school-settings"
import { ResultsPolicyCard } from "@/components/school-settings-management/results-policy-card"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"
import { getSchoolSessionSecurity } from "@/app/actions/session-security"
import { SessionSecurityForm } from "@/components/session/session-security-form"

export default async function SchoolSettingsPage() {
  await requireAdminSchool("school.manage")

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">School Settings</h1>
          <InfoGuide guideKey="admin.schoolSettings" />
        </div>
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

  const [policy, sessionSecurity] = await Promise.all([
    getResultsPolicy(),
    getSchoolSessionSecurity(),
  ])

  return (
    <div className="space-y-6">
      <SchoolSettingsOverview data={settingsData.data} />
      {policy.success ? (
        <ResultsPolicyCard withholdResultsWhenOwing={policy.data.withholdResultsWhenOwing} />
      ) : null}
      {sessionSecurity.success ? <SessionSecurityForm settings={sessionSecurity.data} /> : null}
    </div>
  )
}
