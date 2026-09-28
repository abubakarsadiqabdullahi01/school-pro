import { redirect } from "next/navigation"

import { getCommunicationOptions } from "@/app/actions/communications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { AnnualNoticeComposer } from "@/components/notifications/campaign-composers"
import { CommunicationsNav } from "@/components/notifications/communications-nav"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Annual results notice" }
export const dynamic = "force-dynamic"

export default async function AnnualResultsNoticePage() {
  const actor = await requirePermission("compiler.publish_results").catch(() => null)
  if (!actor) redirect("/dashboard")
  const options = await getCommunicationOptions()
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Annual Results Notice</h1>
            <InfoGuide guideKey="communications.annualResults" />
          </div>
          <p className="text-muted-foreground">Tell families the end-of-session result is ready, once every term of the session is published.</p>
          <CommunicationsNav active="/dashboard/admin/communications/annual-results" />
        </div>
        <AnnualNoticeComposer classes={options.success ? options.data.classes : []} sessions={options.success ? options.data.sessions : []} />
      </div>
    </PageTransition>
  )
}
