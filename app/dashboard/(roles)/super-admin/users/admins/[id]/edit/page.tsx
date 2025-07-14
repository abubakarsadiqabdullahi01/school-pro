import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { getAdminDetailsById } from "@/app/actions/user-management"
import { AdminEditFormWrapper } from "@/components/user-management/admin-edit-form-wrapper"

export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Await the params before accessing its properties
  const { id: adminId } = await params

  // Fetch admin details using the server action
  const adminResult = await getAdminDetailsById(adminId)
  if (!adminResult.success || !adminResult.data) {
    notFound()
  }

  // Fetch all schools for the dropdown
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <AdminEditFormWrapper admin={adminResult.data} schools={schools} />
    </div>
  )
}
