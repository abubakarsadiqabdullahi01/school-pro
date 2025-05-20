import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { TermForm } from "@/components/session-management/term-form"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AdminCreateTermPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
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

  // Get the sessionId from the query params if it exists
  const sessionId = (await searchParams)?.sessionId

  // Fetch all sessions for the admin's school
  const sessions = await prisma.session.findMany({
    where: { schoolId: admin.schoolId },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
  })

  // Format sessions for the dropdown
  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    startDate: session.startDate,
    endDate: session.endDate,
  }))

  // If sessionId is provided, fetch the session details
  let selectedSession = null
  if (sessionId) {
    const sessionDetails = await prisma.session.findUnique({
      where: {
        id: sessionId,
        schoolId: admin.schoolId, // Ensure the session belongs to the admin's school
      },
    })

    if (sessionDetails) {
      selectedSession = {
        id: sessionDetails.id,
        name: sessionDetails.name,
        schoolName: admin.school.name,
        schoolCode: admin.school.code,
        startDate: sessionDetails.startDate,
        endDate: sessionDetails.endDate,
      }
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Academic Term</h2>
          <p className="text-muted-foreground">
            {selectedSession
              ? `Add a new term to ${selectedSession.name}`
              : `Add a new academic term for ${admin.school.name} (${admin.school.code})`}
          </p>
        </div>

        <TermForm sessions={formattedSessions} preselectedSessionId={sessionId} />
      </div>
    </PageTransition>
  )
}
