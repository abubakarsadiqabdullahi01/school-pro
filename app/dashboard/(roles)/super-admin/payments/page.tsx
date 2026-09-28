import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { listPlatformPaymentConfigurations } from "@/app/actions/payment-settings"
import { PageTransition } from "@/components/dashboard/page-transition"
import { PlatformChargeTable } from "@/components/payments/platform-charge-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InfoGuide } from "@/components/ui/info-guide"

export const metadata = { title: "Platform payment charges" }

export default async function PlatformPaymentsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "SUPER_ADMIN") redirect("/dashboard")

  const result = await listPlatformPaymentConfigurations()
  if (!result.success) throw new Error(result.error)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Platform payment charges</h1>
            <InfoGuide guideKey="superAdmin.paymentCharges" />
          </div>
          <p className="text-muted-foreground">
            What DigiSchool keeps from payments it processes for a school.
          </p>
        </div>

        <Alert>
          <AlertTitle>The parent never pays this</AlertTitle>
          <AlertDescription>
            The charge is held back from the school&apos;s settlement, not added to the bill. The
            amount a parent is debited, the receipt the family keeps and the fee the school credits
            are all unchanged — only what reaches the school&apos;s bank is smaller. It applies to
            DigiSchool-managed schools alone; a school on its own Paystack keys settles directly.
          </AlertDescription>
        </Alert>

        <PlatformChargeTable rows={result.data} />
      </div>
    </PageTransition>
  )
}
