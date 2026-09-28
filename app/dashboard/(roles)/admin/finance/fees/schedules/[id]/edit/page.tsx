import { notFound } from "next/navigation"

import { getFeeSchedule, getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FeeScheduleForm } from "@/components/finance/fee-schedule-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function EditFeeSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [schedule, setup] = await Promise.all([getFeeSchedule(id), getFinanceSetupData()])

  if (!schedule.success) notFound()
  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/fees" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{schedule.data.name}</h1>
          <InfoGuide guideKey="finance.fees" />
        </div>
        <p className="text-muted-foreground">
          {schedule.data.scopeLabel} ·{" "}
          {schedule.data.chargeCount === 0
            ? "nothing billed yet"
            : `${schedule.data.chargeCount} charge${
                schedule.data.chargeCount === 1 ? "" : "s"
              } raised, ${schedule.data.settledCharges} with money against ${
                schedule.data.settledCharges === 1 ? "it" : "them"
              }`}
        </p>
      </div>
      <FeeScheduleForm basePath="/dashboard/admin/finance" setup={setup.data} schedule={schedule.data} />
    </div>
  )
}
