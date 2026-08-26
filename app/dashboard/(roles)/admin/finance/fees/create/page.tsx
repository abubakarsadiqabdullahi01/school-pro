import { getFinanceSetupData } from "@/app/actions/finance"
import { FinanceFeeSetupForm } from "@/components/finance/finance-fee-setup-form"

export default async function CreateFeePage() {
  const setup = await getFinanceSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Fee</h1>
        <p className="text-muted-foreground">Create categories and fee schedules. Schedules automatically create student charges.</p>
      </div>
      <FinanceFeeSetupForm setup={setup.data} />
    </div>
  )
}
