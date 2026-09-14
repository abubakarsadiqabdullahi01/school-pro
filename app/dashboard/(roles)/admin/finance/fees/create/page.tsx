import { getFinanceSetupData } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FinanceFeeSetupForm } from "@/components/finance/finance-fee-setup-form"

export default async function CreateFeePage() {
  const setup = await getFinanceSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/fees" />
        <h1 className="text-3xl font-bold tracking-tight">Create Fee</h1>
        <p className="text-muted-foreground">
          Create the fee category first, then create the new fee schedule that bills the selected class.
        </p>
      </div>
      <FinanceFeeSetupForm setup={setup.data} />
    </div>
  )
}
