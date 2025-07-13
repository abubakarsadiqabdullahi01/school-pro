import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getSystemAnalytics } from "@/app/actions/analytics"
import { SuperAdminAnalytics } from "@/components/analytics/super-admin-analytics"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function SuperAdminAnalyticsPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const analyticsResult = await getSystemAnalytics()

  if (!analyticsResult.success) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive">Error Loading Analytics</h3>
            <p className="text-muted-foreground">{analyticsResult.error || "Failed to load analytics data"}</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <SuperAdminAnalytics data={analyticsResult.data} />
    </PageTransition>
  )
}
