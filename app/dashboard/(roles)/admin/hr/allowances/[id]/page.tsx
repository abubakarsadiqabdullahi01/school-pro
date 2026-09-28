import { notFound } from "next/navigation"

import { getAllowanceType } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { PayComponentForm } from "@/components/hr/pay-component-form"
import { Badge } from "@/components/ui/badge"
import { InfoGuide } from "@/components/ui/info-guide"
import { componentKindLabel, componentValueLabel } from "@/lib/hr/pay-component-filters"
import { formatNaira } from "@/lib/money"

export default async function AllowancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const component = await getAllowanceType(id)

  if (!component.success) notFound()

  const { data } = component

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr/allowances" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <InfoGuide guideKey="hr.allowances" />
          {!data.isActive && <Badge variant="secondary">Retired</Badge>}
        </div>
        <p className="text-muted-foreground">
          {componentKindLabel(data.kind)} · {componentValueLabel(data.kind, data.value, formatNaira)} ·{" "}
          {data.assignedCount} {data.assignedCount === 1 ? "person" : "people"} on it
        </p>
      </div>
      <PayComponentForm basePath="/dashboard/admin/hr" kind="allowance" component={data} />
    </div>
  )
}
