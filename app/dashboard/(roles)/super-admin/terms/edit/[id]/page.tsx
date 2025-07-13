import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { TermForm } from "@/components/session-management/term-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"

export default async function EditTermPage({ params }: { params: { id: string } }) {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Ensure params is properly awaited
  const id = params.id

  // Fetch the term to edit
  const termData = await prisma.term.findUnique({
    where: { id },
    include: {
      session: {
        select: {
          id: true,
          name: true,
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
        <TermForm
          sessions={formattedSessions}
          termData={{
            id: termData.id,
            name: termData.name,
            sessionId: termData.sessionId,
            startDate: termData.startDate,
            endDate: termData.endDate,
            isCurrent: termData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
