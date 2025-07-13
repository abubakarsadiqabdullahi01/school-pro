import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SchoolInformationForm } from "@/components/school-settings-management/school-information-form"
import { getSchoolInformationData } from "@/app/actions/school-settings"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function SchoolInformationPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4"> 
        <div>
          <h1 className="text-3xl font-bold tracking-tight">School Information</h1>
          <p className="text-muted-foreground">Update your school's basic information and contact details</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/admin/school-settings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <Suspense fallback={<LoadingSpinner message="Loading school information..." />}>
        <SchoolInformationContent />
      </Suspense>
    </div>
  )
}

async function SchoolInformationContent() {
  const informationData = await getSchoolInformationData()

  if (!informationData.success) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Failed to load school information</p>
      </div>
    )
  }

  return <SchoolInformationForm data={informationData.data} />
}
