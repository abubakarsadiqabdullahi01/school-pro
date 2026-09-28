import { getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FeeScheduleForm } from "@/components/finance/fee-schedule-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewFeeSchedulePage() {
  const setup = await getFinanceSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/fees" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Fee Schedule</h1>
          <InfoGuide guideKey="finance.fees" />
        </div>
        <p className="text-muted-foreground">
          An instruction to bill a class, a term or the whole session. It raises the charges as soon as it
          is created.
        </p>
      </div>
      <FeeScheduleForm basePath="/dashboard/admin/finance" setup={setup.data} />
    </div>
  )
}
