import { AdminDashboardClient } from "@/components/admin-dashboard/admin-dashboard-client"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminDashboardPage() {
  await requireAdminSchool()

  return <AdminDashboardClient />
}
