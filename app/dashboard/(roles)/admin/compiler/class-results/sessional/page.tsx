import { redirect } from "next/navigation"

import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/authz"
import { PageTransition } from "@/components/dashboard/page-transition"
import { SessionResultsView } from "@/components/class-results/session-results-view"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "Sessional class results" }

export default async function AdminClassResultsSessionalPage() {
  const actor = await requirePermission("compiler.review_results").catch(() => null)
  if (!actor?.schoolId) redirect("/dashboard")

  const [sessions, classes] = await Promise.all([
    prisma.session.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    prisma.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, level: true },
    }),
  ])

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Sessional Class Results</h1>
            <InfoGuide guideKey="compiler.classResultsSessional" />
          </div>
          <p className="text-muted-foreground">
            A whole session for one class — the broadsheet and every report card, in the
            format the school already uses for a term.
          </p>
        </div>

        <SessionResultsView sessions={sessions} classes={classes} />
      </div>
    </PageTransition>
  )
}
