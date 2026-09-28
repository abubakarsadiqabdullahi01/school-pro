import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { PaymentSettingsForm } from "@/components/payments/payment-settings-form"
import { Button } from "@/components/ui/button"
import { InfoGuide } from "@/components/ui/info-guide"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { getPaymentSettingsForSchool } from "@/lib/payments/payment-settings.server"

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string }>
}) {
  const { schoolId } = await requireAdminSchool("finance.manage_gateway")
  const query = await searchParams
  const environment = query.environment === "live" ? "LIVE" : "TEST"
  const data = await getPaymentSettingsForSchool(schoolId, environment)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Online Payment Setup</h1>
            <InfoGuide guideKey="admin.schoolSettings" />
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Connect Paystack without changing the existing cash, POS, cheque, or manual bank-transfer workflow.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/admin/school-settings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Configuration is saved disabled. Verification and activation are separate steps.
        </div>
        <div className="flex gap-2">
          <Button variant={environment === "TEST" ? "default" : "outline"} size="sm" asChild>
            <Link href="/dashboard/admin/school-settings/payments?environment=test">Test</Link>
          </Button>
          <Button variant={environment === "LIVE" ? "default" : "outline"} size="sm" asChild>
            <Link href="/dashboard/admin/school-settings/payments?environment=live">Live</Link>
          </Button>
        </div>
      </div>

      <PaymentSettingsForm initialData={data} />
    </div>
  )
}
