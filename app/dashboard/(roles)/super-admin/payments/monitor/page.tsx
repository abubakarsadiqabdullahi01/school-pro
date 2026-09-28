import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getPaymentPilotMonitor } from "@/app/actions/payment-pilot"
import { PageTransition } from "@/components/dashboard/page-transition"
import { PaymentPilotMonitor } from "@/components/payments/payment-pilot-monitor"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "Payment pilot monitor" }
export const dynamic = "force-dynamic"

export default async function PaymentPilotMonitorPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "SUPER_ADMIN") redirect("/dashboard")

  const result = await getPaymentPilotMonitor()
  if (!result.success) throw new Error(result.error)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Payment pilot monitor</h1>
            <InfoGuide guideKey="superAdmin.paymentMonitor" />
          </div>
          <p className="text-muted-foreground">
            Every school&apos;s online payment health, and the approval each needs before taking live money.
          </p>
        </div>
        <PaymentPilotMonitor {...result.data} />
      </div>
    </PageTransition>
  )
}
