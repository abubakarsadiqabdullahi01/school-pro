import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AdminSessionsTable } from "@/components/session-management/admin-session-table"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AdminSchoolSessionsPage() {
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

  // Fetch all sessions for the admin's school
  const sessions = await prisma.session.findMany({
    where: { schoolId: admin.schoolId },
    orderBy: [{ isCurrent: "desc" }, { endDate: "desc" }],
  })

  // Format sessions for the table
  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    school: admin.school.name,
    schoolCode: admin.school.code,
    schoolId: admin.schoolId,
    startDate: session.startDate,
    endDate: session.endDate,
    isCurrent: session.isCurrent,
    termsCount: 0, // We'll update this below
    createdAt: session.createdAt,
  }))

  // Get term counts for each session
  for (const formattedSession of formattedSessions) {
    const termsCount = await prisma.term.count({
      where: { sessionId: formattedSession.id },
    })
    formattedSession.termsCount = termsCount
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Academic Sessions</h2>
          <p className="text-muted-foreground">
            Manage academic sessions for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <AdminSessionsTable sessions={formattedSessions} />
      </div>
    </PageTransition>
  )
}
