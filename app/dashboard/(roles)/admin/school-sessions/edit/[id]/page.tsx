import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AdminSessionEditForm } from "@/components/session-management/admin-session-edit-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"

export default async function AdminEditSessionPage({ params }: { params: { id: string } }) {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true },
  })

  if (!admin) {
    redirect("/dashboard/access-error")
  }

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the session to edit, ensuring it belongs to the admin's school
  const sessionData = await prisma.session.findUnique({
    where: {
      id,
      schoolId: admin.schoolId, // Ensure the session belongs to the admin's school
    },
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

  if (!sessionData) {
    notFound()
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Academic Session</h2>
          <p className="text-muted-foreground">
            Update the academic session for {sessionData.school.name} ({sessionData.school.code})
          </p>
        </div>

        <AdminSessionEditForm
          sessionData={{
            id: sessionData.id,
            name: sessionData.name,
            schoolId: sessionData.schoolId,
            schoolName: sessionData.school.name,
            schoolCode: sessionData.school.code,
            startDate: sessionData.startDate,
            endDate: sessionData.endDate,
            isCurrent: sessionData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
