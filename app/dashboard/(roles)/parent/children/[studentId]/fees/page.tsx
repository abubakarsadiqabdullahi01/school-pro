import { notFound } from "next/navigation"

import { getStudentDedicatedAccountForParent } from "@/app/actions/dedicated-accounts"
import { getPendingOnlinePayments } from "@/app/actions/online-payment"
import { getChildOverview } from "@/app/actions/parent-portal"
import { FeesPanel, ReceiptsPanel, SummaryTile } from "@/components/portal/portal-panels"
import { PortalFeesTabs } from "@/components/portal/fees-tabs"
import { BackButton } from "@/components/back-button"
import { PageTransition } from "@/components/dashboard/page-transition"
import { InfoGuide } from "@/components/ui/info-guide"
import { OnlinePaymentCheckout } from "@/components/payments/online-payment-checkout"
import { PendingOnlinePayments } from "@/components/payments/pending-online-payments"
import { TransferAccountCard } from "@/components/payments/transfer-account-card"

interface FeesPageProps {
  params: Promise<{ studentId: string }>
}

export const metadata = { title: "Fees and receipts" }

/** The same rule the checkout applies, so the tab appears exactly when it has something in it. */
const SETTLED = ["PAID", "WAIVED", "CANCELLED"]

export default async function ParentChildFeesPage({ params }: FeesPageProps) {
  const { studentId } = await params

  // The action carries the authorization: only a child linked to the signed-in parent.
  const result = await getChildOverview(studentId)
  if (!result.success) notFound()
  const [transferAccount, pendingPayments] = await Promise.all([
    getStudentDedicatedAccountForParent(studentId),
    getPendingOnlinePayments(studentId),
  ])

  const { student, fees } = result.data
  const unpaid = fees.charges.filter((charge) => !SETTLED.includes(charge.status))
  const canPayOnline = fees.onlinePaymentAvailable && unpaid.length > 0

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref={`/dashboard/parent/children/${studentId}`} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Fees and receipts</h1>
            <InfoGuide guideKey="parent.children" />
          </div>
          <p className="text-muted-foreground tabular-nums">
            {student.name} · {student.admissionNo}
          </p>
        </div>

        <PendingOnlinePayments studentId={studentId} payments={pendingPayments} />

        {transferAccount && <TransferAccountCard account={transferAccount} />}

        <PortalFeesTabs
          outstanding={fees.balance}
          unpaidCount={unpaid.length}
          receiptCount={fees.payments.length}
          canPayOnline={canPayOnline}
          summary={
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryTile label="Billed" value={fees.billed} />
              <SummaryTile label="Paid" value={fees.paid} />
              <SummaryTile label="Outstanding" value={fees.balance} />
            </div>
          }
          fees={<FeesPanel charges={fees.charges} />}
          payOnline={
            <OnlinePaymentCheckout
              studentId={student.id}
              enabled={fees.onlinePaymentAvailable}
              allowPartialPayments={fees.allowPartialPayments}
              charges={fees.charges}
            />
          }
          receipts={
            <ReceiptsPanel
              payments={fees.payments}
              receiptHrefBase={`/dashboard/parent/children/${studentId}/fees`}
            />
          }
        />
      </div>
    </PageTransition>
  )
}
