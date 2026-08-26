import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getTerms } from "@/app/actions/term-management"
import { AllTermsTable } from "@/components/session-management/all-terms-table"
import { PageTransition } from "@/components/dashboard/page-transition"
import { getActiveSchool } from "@/lib/school-context.server"
import { schoolLabel } from "@/lib/school-context"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"

export default async function AllTermsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const activeSchool = await getActiveSchool()
  const termsResult = await getTerms()

  if (!termsResult.success || !termsResult.data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive">Error Loading Terms</h3>
            <p className="text-muted-foreground">{termsResult.error || "Failed to load terms data"}</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Academic Terms</h2>
            <p className="text-muted-foreground">
              {activeSchool
                ? `Terms for ${schoolLabel(activeSchool)}`
                : "Manage academic terms across all sessions and schools"}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/super-admin/terms/create">
              <Plus className="mr-2 h-4 w-4" />
              Add Term
            </Link>
          </Button>
        </div>

        <AllTermsTable terms={termsResult.data} hideSchoolColumn={!!activeSchool} />
      </div>
    </PageTransition>
  )
}
