import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AdminCreationForm } from "@/components/user-management/admin-creation-form"

export default async function AddAdminPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch all schools for the dropdown
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add Administrator</h2>
        <p className="text-muted-foreground">Create a new administrator account</p>
      </div>

      <AdminCreationForm schools={schools} />
    </div>
  )
}

