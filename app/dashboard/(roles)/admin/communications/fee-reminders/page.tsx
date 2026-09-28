import { redirect } from "next/navigation"

import { getCommunicationOptions } from "@/app/actions/communications"
import { PageTransition } from "@/components/dashboard/page-transition"
import { FeeReminderComposer } from "@/components/notifications/campaign-composers"
import { CommunicationsNav } from "@/components/notifications/communications-nav"
import { InfoGuide } from "@/components/ui/info-guide"
import { requireAnyPermission } from "@/lib/authz"

export const metadata = { title: "Fee reminders" }
export const dynamic = "force-dynamic"

export default async function FeeRemindersPage() {
  const actor = await requireAnyPermission(["school.manage", "finance.setup"]).catch(() => null)
  if (!actor) redirect("/dashboard")
  const options = await getCommunicationOptions()
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Fee Reminders</h1>
            <InfoGuide guideKey="communications.feeReminders" />
          </div>
          <p className="text-muted-foreground">Remind the guardians of learners with an outstanding balance, with a link to pay online.</p>
          <CommunicationsNav active="/dashboard/admin/communications/fee-reminders" />
        </div>
        <FeeReminderComposer classes={options.success ? options.data.classes : []} />
      </div>
    </PageTransition>
  )
}
