import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getAdminDetailsById } from "@/app/actions/user-management"
import { AdminDetails } from "@/components/user-management/admin-details"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"

export default async function AdminDetailsPage({ params }: { params: { id: string } }) {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const adminId = params.id
  const result = await getAdminDetailsById(adminId)

  if (!result.success || !result.data) {
    notFound()
  }

  return (
    <PageTransition>
      <AdminDetails admin={result.data} />
    </PageTransition>
  )
}
