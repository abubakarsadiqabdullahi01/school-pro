import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionsTable } from "@/components/session-management/sessions-table"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { getActiveSchool } from "@/lib/school-context.server"
import { schoolLabel } from "@/lib/school-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function SessionsPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Scope to the school selected in the header switcher, or show every school.
  const activeSchool = await getActiveSchool()

  const sessions = await prisma.session.findMany({
    where: activeSchool ? { schoolId: activeSchool.id } : {},
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
    studentsCount: 0,
    createdAt: session.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-3xl font-bold tracking-tight">Academic Sessions</h2>
              <InfoGuide guideKey="admin.sessions" />
            </div>
            <p className="text-muted-foreground">
              {activeSchool
                ? `Sessions for ${schoolLabel(activeSchool)}`
                : "Manage academic sessions across all schools"}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/super-admin/sessions/create">
              <Plus className="mr-2 h-4 w-4" />
              Add Session
            </Link>
          </Button>
        </div>

        <SessionsTable sessions={formattedSessions} hideSchoolColumn={!!activeSchool} />
      </div>
    </PageTransition>
  )
}
