import { getPaymentAccounts } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { PaymentAccountForm } from "@/components/expenditure/payment-account-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewPaymentAccountPage() {
  // The names already taken, so the form can say so as it is typed rather than returning a
  // unique-constraint error on submit.
  const accounts = await getPaymentAccounts()
  const takenNames = accounts.success
    ? accounts.data.rows.map((row) => ({ id: row.id, name: row.name }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure/accounts" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Payment Account</h1>
          <InfoGuide guideKey="expenditure.accounts" />
        </div>
        <p className="text-muted-foreground">
          A place money is paid from. Create this before the first voucher that names it.
        </p>
      </div>
      <PaymentAccountForm basePath="/dashboard/admin/expenditure" takenNames={takenNames} />
    </div>
  )
}
