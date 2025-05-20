import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherCreateForm } from "@/components/teacher-management/teacher-create-form"

export default async function AdminCreateTeacherPage() {
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

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create New Teacher</h2>
          <p className="text-muted-foreground">
            Add a new teacher to {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <TeacherCreateForm schoolId={admin.schoolId} schoolName={admin.school.name} />
      </div>
    </PageTransition>
  )
}
