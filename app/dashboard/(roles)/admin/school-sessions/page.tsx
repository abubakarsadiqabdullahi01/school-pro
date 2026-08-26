import { prisma } from "@/lib/db"
import { AdminSessionsTable } from "@/components/session-management/admin-session-table"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminSchoolSessionsPage() {
  const { school, schoolId } = await requireAdminSchool()

  const sessions = await prisma.session.findMany({
    where: { schoolId },
    include: {
      _count: {
        select: { terms: true },
      },
    },
    orderBy: [{ isCurrent: "desc" }, { endDate: "desc" }],
  })

  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    school: school.name,
    schoolCode: school.code,
    schoolId,
    startDate: session.startDate,
    endDate: session.endDate,
    isCurrent: session.isCurrent,
    termsCount: session._count.terms,
    createdAt: session.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Academic Sessions</h2>
          <p className="text-muted-foreground">
            Manage academic sessions for {school.name} ({school.code})
          </p>
        </div>

        <AdminSessionsTable sessions={formattedSessions} />
      </div>
    </PageTransition>
  )
}
