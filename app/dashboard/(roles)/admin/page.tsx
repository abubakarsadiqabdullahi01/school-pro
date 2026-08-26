import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AdminDashboardClient } from "@/components/admin-dashboard/admin-dashboard-client"

export default async function AdminDashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return <AdminDashboardClient />
}
