import { redirect } from "next/navigation"

import { PageTransition } from "@/components/dashboard/page-transition"
import { ResultsNoticeView } from "@/components/notifications/results-notice-view"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"

export const metadata = { title: "Result notifications" }

export default async function ResultNotificationsPage() {
  const actor = await requirePermission("compiler.publish_results").catch(() => null)
  if (!actor?.schoolId) redirect("/dashboard")

  const classTerms = await prisma.classTerm.findMany({
    where: { class: { schoolId: actor.schoolId } },
    orderBy: [{ term: { startDate: "desc" } }, { class: { name: "asc" } }],
    // A school accumulates class terms every term; this screen only needs the recent ones.
    take: 60,
    select: {
      id: true,
      class: { select: { name: true } },
      term: { select: { name: true, session: { select: { name: true } } } },
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Result Notifications</h1>
            <InfoGuide guideKey="compiler.notifications" />
          </div>
          <p className="text-muted-foreground">
            Tell families that a term&apos;s results are ready, by text message or email.
            Nothing is sent until you have seen how many people it reaches.
          </p>
        </div>

        <ResultsNoticeView
          classTerms={classTerms.map((row) => ({
            id: row.id,
            label: `${row.class.name} · ${row.term.name} · ${row.term.session.name}`,
          }))}
        />
      </div>
    </PageTransition>
  )
}
