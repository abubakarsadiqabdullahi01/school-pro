import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getSystemStats, getSchoolPerformance } from "@/app/actions/user-management"
import { SuperAdminDashboard } from "@/components/dashboard/super-admin-dashboard"

export default async function SuperAdminDashboardPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch real data
  const [statsResult, performanceResult] = await Promise.all([getSystemStats(), getSchoolPerformance()])

  if (!statsResult.success || !performanceResult.success) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-destructive">Error Loading Dashboard</h3>
          <p className="text-muted-foreground">
            {statsResult.error || performanceResult.error || "Failed to load dashboard data"}
          </p>
        </div>
      </div>
    )
  }

  return <SuperAdminDashboard stats={statsResult.data} schoolPerformance={performanceResult.data} />
}
