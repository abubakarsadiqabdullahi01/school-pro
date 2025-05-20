import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionsTable } from "@/components/session-management/sessions-table"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function SessionsPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch all sessions with school information
  const sessions = await prisma.session.findMany({
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      terms: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [{ isCurrent: "desc" }, { endDate: "desc" }],
  })

  // Format sessions for the table
  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    school: session.school.name,
    schoolCode: session.school.code,
    schoolId: session.school.id,
    startDate: session.startDate,
    endDate: session.endDate,
    isCurrent: session.isCurrent,
    termsCount: session.terms.length,
    createdAt: session.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Academic Sessions</h2>
          <p className="text-muted-foreground">Manage academic sessions across all schools</p>
        </div>

        <SessionsTable sessions={formattedSessions} />
      </div>
    </PageTransition>
  )
}
