import { prisma } from "@/lib/db"
import { AdminTermEditForm } from "@/components/session-management/admin-term-edit-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminEditTermPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")
  const { id } = await params

  const termData = await prisma.term.findFirst({
    where: {
      id,
      session: { schoolId },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          schoolId: true,
          startDate: true,
          endDate: true,
          school: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      },
    },
  })

  if (!termData) {
    notFound()
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Academic Term</h2>
          <p className="text-muted-foreground">
            Update the term for {termData.session.name} - {termData.session.school.name} ({termData.session.school.code}
            )
          </p>
        </div>

        <AdminTermEditForm
          termData={{
            id: termData.id,
            name: termData.name,
            sessionId: termData.sessionId,
            sessionName: termData.session.name,
            schoolName: termData.session.school.name,
            schoolCode: termData.session.school.code,
            sessionStartDate: termData.session.startDate,
            sessionEndDate: termData.session.endDate,
            startDate: termData.startDate,
            endDate: termData.endDate,
            isCurrent: termData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
