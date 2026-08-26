import { prisma } from "@/lib/db"
import { AdminSessionEditForm } from "@/components/session-management/admin-session-edit-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminEditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool()
  const { id } = await params

  const sessionData = await prisma.session.findFirst({
    where: {
      id,
      schoolId,
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
