import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AllTermsTable } from "@/components/session-management/all-terms-table"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function TermsPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch all terms with session and school information
  const terms = await prisma.term.findMany({
    include: {
      session: {
        select: {
          id: true,
          name: true,
          school: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
  })

  // Format terms for the table
  const formattedTerms = terms.map((term) => ({
    id: term.id,
    name: term.name,
    sessionId: term.sessionId,
    sessionName: term.session.name,
    schoolId: term.session.school.id,
    schoolName: term.session.school.name,
    schoolCode: term.session.school.code,
    startDate: term.startDate,
    endDate: term.endDate,
    isCurrent: term.isCurrent,
    createdAt: term.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Academic Terms</h2>
          <p className="text-muted-foreground">Manage academic terms across all schools</p>
        </div>

        <AllTermsTable terms={formattedTerms} />
      </div>
    </PageTransition>
  )
}
