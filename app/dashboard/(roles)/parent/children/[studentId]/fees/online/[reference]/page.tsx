import { notFound } from "next/navigation"

import { getOnlinePaymentStatus } from "@/app/actions/online-payment"
import { BackButton } from "@/components/back-button"
import { PageTransition } from "@/components/dashboard/page-transition"
import { OnlinePaymentStatus } from "@/components/payments/online-payment-status"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "Online payment status" }

export default async function OnlinePaymentStatusPage({ params }: {
  params: Promise<{ studentId: string; reference: string }>
}) {
  const { studentId, reference } = await params
  const result = await getOnlinePaymentStatus(studentId, reference)
  if (!result.success) notFound()

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref={`/dashboard/parent/children/${studentId}/fees`} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Online payment status</h1>
            <InfoGuide guideKey="parent.children" />
          </div>
          <p className="text-muted-foreground">A browser return is not proof of payment. This screen shows the server's recorded state.</p>
        </div>
        <OnlinePaymentStatus studentId={studentId} initial={result.data} />
      </div>
    </PageTransition>
  )
}
