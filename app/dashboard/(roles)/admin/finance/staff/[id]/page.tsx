import { notFound } from "next/navigation"

import { getFinanceOfficer } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FinanceStaffDetailForm } from "@/components/finance/finance-staff-detail-form"
import { Badge } from "@/components/ui/badge"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function FinanceStaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const officer = await getFinanceOfficer(id)

  if (!officer.success) notFound()

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/staff" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{officer.data.name}</h1>
            <InfoGuide guideKey="finance.staff" />
          </div>
          {!officer.data.isActive && <Badge variant="secondary">Access revoked</Badge>}
        </div>
        <p className="text-muted-foreground">
          {officer.data.email ?? "No sign-in address"}
          {officer.data.phone ? ` · ${officer.data.phone}` : ""}
        </p>
      </div>
      <FinanceStaffDetailForm basePath="/dashboard/admin/finance" officer={officer.data} />
    </div>
  )
}
