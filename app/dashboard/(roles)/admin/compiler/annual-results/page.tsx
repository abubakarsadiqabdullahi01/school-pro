import { redirect } from "next/navigation"

import { AnnualResultsView } from "@/components/annual-results/annual-results-view"
import { PageTransition } from "@/components/dashboard/page-transition"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { getSchoolBranding } from "@/lib/school-branding.server"

export const metadata = { title: "Annual results and promotion" }

export default async function AnnualResultsPage() {
  const actor = await requirePermission("compiler.review_results").catch(() => null)
  if (!actor?.schoolId) redirect("/dashboard")

  const [sessions, classes, school] = await Promise.all([
    prisma.session.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    prisma.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    // The letterhead for the printed sheet and the PDF. Resolved here because the view is a
    // client component and cannot reach a server-only helper.
    getSchoolBranding(),
  ])

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="print:hidden">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Annual Results</h1>
            <InfoGuide guideKey="compiler.annualResults" />
          </div>
          <p className="text-muted-foreground">
            Who goes up, who repeats, and who leaves — worked out from each class&apos;s own
            promotion rules, then approved by the principal before it reaches a report card.
          </p>
        </div>

        <AnnualResultsView sessions={sessions} classes={classes} school={school} />
      </div>
    </PageTransition>
  )
}
