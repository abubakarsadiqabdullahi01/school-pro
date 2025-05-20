import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { TermForm } from "@/components/session-management/term-form"
import { PageTransition } from "@/components/dashboard/page-transition"

interface CreateTermPageProps {
  searchParams: { 
    sessionId?: string
    [key: string]: string | string[] | undefined 
  }
}

export default async function CreateTermPage({
  searchParams,
}: CreateTermPageProps) {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Get the sessionId from the query params if it exists
  const sessionId = (await searchParams)?.sessionId

  // Fetch all sessions for the dropdown
  const sessions = await prisma.session.findMany({
    include: {
      school: {
        select: {
          name: true,
          code: true,
        },
      },
    },
    orderBy: [{ isCurrent: "desc" }, { school: { name: "asc" } }, { startDate: "desc" }],
  })

  // Format sessions for the dropdown
  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: `${session.name} - ${session.school.name} (${session.school.code})`,
    startDate: session.startDate,
    endDate: session.endDate,
  }))

  // If sessionId is provided, fetch the session details
  let selectedSession = null
  if (sessionId) {
    const sessionDetails = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        school: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    })

    if (sessionDetails) {
      selectedSession = {
        id: sessionDetails.id,
        name: sessionDetails.name,
        schoolName: sessionDetails.school.name,
        schoolCode: sessionDetails.school.code,
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
              ? `Add a new term to ${selectedSession.name} - ${selectedSession.schoolName} (${selectedSession.schoolCode})`
              : "Add a new academic term to a session"}
          </p>
        </div>

        <TermForm sessions={formattedSessions} preselectedSessionId={sessionId} />
      </div>
    </PageTransition>
  )
}