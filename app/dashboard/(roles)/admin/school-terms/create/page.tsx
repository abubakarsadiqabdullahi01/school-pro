import { prisma } from "@/lib/db"
import { TermForm } from "@/components/session-management/term-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCreateTermPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { actor, school, schoolId } = await requireAdminSchool("academics.manage")

  const params = await searchParams
  const rawSessionId = params.sessionId
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId

  const sessions = await prisma.session.findMany({
    where: { schoolId },
    // The names already used, so the form can grey out a term this session has.
    include: { terms: { select: { name: true } } },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
  })

  // Format sessions for the dropdown
  const formattedSessions = sessions.map((session) => ({
    id: session.id,
    name: session.name,
    startDate: session.startDate,
    endDate: session.endDate,
    isCurrent: session.isCurrent,
    existingTermNames: session.terms.map((term) => term.name),
  }))

  // If sessionId is provided, fetch the session details
  let selectedSession = null
  if (sessionId) {
    const sessionDetails = await prisma.session.findFirst({
      where: {
        id: sessionId,
        schoolId,
      },
    })

    if (sessionDetails) {
      selectedSession = {
        id: sessionDetails.id,
        name: sessionDetails.name,
        schoolName: school.name,
        schoolCode: school.code,
        startDate: sessionDetails.startDate,
        endDate: sessionDetails.endDate,
      }
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create Academic Term</h2>
            <InfoGuide guideKey="admin.terms" />
          </div>
          <p className="text-muted-foreground">
            {selectedSession
              ? `Add a new term to ${selectedSession.name}`
              : `Add a new academic term for ${school.name} (${school.code})`}
          </p>
        </div>

        <TermForm
          sessions={formattedSessions}
          preselectedSessionId={sessionId}
          listHref="/dashboard/admin/school-terms"
          viewerRole={actor?.role}
        />
      </div>
    </PageTransition>
  )
}
