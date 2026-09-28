import { redirect } from "next/navigation"

import { getMyOverview } from "@/app/actions/student-portal"
import { FeesPanel, ReceiptsPanel, SummaryTile } from "@/components/portal/portal-panels"
import { PortalFeesTabs } from "@/components/portal/fees-tabs"
import { PageTransition } from "@/components/dashboard/page-transition"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "My fees" }

/** Matches the parent portal, so a fee counted there is counted the same way here. */
const SETTLED = ["PAID", "WAIVED", "CANCELLED"]

export default async function StudentFeesPage() {
  const result = await getMyOverview()
  if (!result.success) redirect("/dashboard/access-error")

  const { fees } = result.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">My Fees</h1>
            <InfoGuide guideKey="student.dashboard" />
          </div>
          <p className="text-muted-foreground">What the school has billed you, and every receipt against your name.</p>
        </div>

        {/* The same three sections the parent portal uses, minus the checkout: a learner
            reads their fees, they do not pay them. */}
        <PortalFeesTabs
          outstanding={fees.balance}
          unpaidCount={fees.charges.filter((charge) => !SETTLED.includes(charge.status)).length}
          receiptCount={fees.payments.length}
          canPayOnline={false}
          summary={
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryTile label="Billed" value={fees.billed} />
              <SummaryTile label="Paid" value={fees.paid} />
              <SummaryTile label="Outstanding" value={fees.balance} />
            </div>
          }
          fees={<FeesPanel charges={fees.charges} />}
          payOnline={null}
          receipts={
            <ReceiptsPanel payments={fees.payments} receiptHrefBase="/dashboard/student/fees" />
          }
        />
      </div>
    </PageTransition>
  )
}
