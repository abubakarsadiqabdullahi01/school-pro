import { BackButton } from "@/components/back-button"
import { getHrSetupData } from "@/app/actions/hr"
import { ComponentTypesForm } from "@/components/hr/hr-setup-forms"

export default async function DeductionsPage() {
  const setup = await getHrSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr" />
        <h1 className="text-3xl font-bold tracking-tight">Deductions</h1>
        <p className="text-muted-foreground">What comes off gross pay, before or after tax.</p>
      </div>
      <ComponentTypesForm kind="DEDUCTION" types={setup.data.deductionTypes} />
    </div>
  )
}
