import { Suspense } from "react"
import { AdmissionSettingsForm } from "@/components/school-settings-management/admission-settings-form"
import { getAdmissionSettingsData } from "@/app/actions/school-settings"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdmissionSettingsPage() {
  await requireAdminSchool()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admission Settings</h1>
          <p className="text-muted-foreground">Configure admission number format and sequence management</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/admin/school-settings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <Suspense fallback={<LoadingSpinner message="Loading admission settings..." />}>
        <AdmissionSettingsContent />
      </Suspense>
    </div>
  )
}

async function AdmissionSettingsContent() {
  const settingsData = await getAdmissionSettingsData()

  if (!settingsData.success || !settingsData.data) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Failed to load admission settings</p>
      </div>
    )
  }

  return <AdmissionSettingsForm data={settingsData.data} />
}
