import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getTerms } from "@/app/actions/term-management"
import { AllTermsTable } from "@/components/session-management/all-terms-table"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AllTermsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const termsResult = await getTerms()

  if (!termsResult.success) {
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
      <AllTermsTable terms={termsResult.data} />
    </PageTransition>
  )
}
