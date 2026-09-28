import { notFound } from "next/navigation"

import { getSalaryScale } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { SalaryScaleForm } from "@/components/hr/salary-scale-form"
import { Badge } from "@/components/ui/badge"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatNaira } from "@/lib/money"

export default async function SalaryScalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scale = await getSalaryScale(id)

  if (!scale.success) notFound()

  const { data } = scale

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr/salary-scales" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <InfoGuide guideKey="hr.salaryScales" />
          {!data.isActive && <Badge variant="secondary">Retired</Badge>}
        </div>
        <p className="text-muted-foreground">
          {[data.gradeLevel, data.step].filter(Boolean).join(" · ") || "No grade set"} ·{" "}
          {formatNaira(data.baseSalary)} a month · {data.staffCount}{" "}
          {data.staffCount === 1 ? "person" : "people"} on it
        </p>
      </div>
      <SalaryScaleForm basePath="/dashboard/admin/hr" scale={data} />
    </div>
  )
}
