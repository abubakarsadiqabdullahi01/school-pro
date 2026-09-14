import { BackButton } from "@/components/back-button"
import { getExpenditureSetupData } from "@/app/actions/expenditure"
import { PaymentAccountsForm } from "@/components/expenditure/expenditure-setup-forms"

// Admin tree only, for the same reason as categories.
export default async function PaymentAccountsPage() {
  const setup = await getExpenditureSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure" />
        <h1 className="text-3xl font-bold tracking-tight">Payment Chart</h1>
        <p className="text-muted-foreground">Where money is paid from, and what each account has left.</p>
      </div>
      <PaymentAccountsForm accounts={setup.data.accounts} />
    </div>
  )
}
