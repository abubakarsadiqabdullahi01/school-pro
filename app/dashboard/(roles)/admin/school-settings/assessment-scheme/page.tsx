import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageTransition } from "@/components/dashboard/page-transition"
import { Button } from "@/components/ui/button"
import { AssessmentSchemeForm } from "@/components/school-settings-management/assessment-scheme-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { loadAssessmentScheme } from "@/lib/assessment-scheme.server"

export default async function AssessmentSchemePage() {
  const { school, schoolId } = await requireAdminSchool()
  const scheme = await loadAssessmentScheme(schoolId)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assessment Scheme</h1>
            <p className="text-muted-foreground">
              How marks are split for {school.name} ({school.code})
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/school-settings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Link>
          </Button>
        </div>

        <AssessmentSchemeForm scheme={scheme} schoolName={school.name} />
      </div>
    </PageTransition>
  )
}
