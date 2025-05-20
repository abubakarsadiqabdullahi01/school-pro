import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeachersTable } from "@/components/teacher-management/teachers-table"
import { getTeachers } from "@/app/actions/teacher-management"

export default async function AdminTeachersPage() {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error")
  }

  // Fetch all teachers for the admin's school
  const teachersResult = await getTeachers()
  const teachers = teachersResult.success ? teachersResult.data : []

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Teacher Management</h2>
          <p className="text-muted-foreground">
            Manage teachers for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <TeachersTable teachers={teachers} />
      </div>
    </PageTransition>
  )
}
