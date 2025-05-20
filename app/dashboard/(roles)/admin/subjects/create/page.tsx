import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SubjectForm } from "@/components/subject-management/subject-form"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AdminCreateSubjectPage() {
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
          <h2 className="text-3xl font-bold tracking-tight">Create Subject</h2>
          <p className="text-muted-foreground">
            Add a new subject for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <SubjectForm schoolId={admin.school.id} />
      </div>
    </PageTransition>
  )
}
