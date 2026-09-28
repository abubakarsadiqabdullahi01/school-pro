import { notFound } from "next/navigation"

import { getPaymentAccount } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { PaymentAccountForm } from "@/components/expenditure/payment-account-form"
import { Badge } from "@/components/ui/badge"
import { paymentAccountTypeLabel } from "@/lib/expenditure/payment-account-filters"
import { formatNaira } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function PaymentAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = await getPaymentAccount(id)

  if (!account.success) notFound()

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure/accounts" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">{account.data.name}</h1>
            <InfoGuide guideKey="expenditure.accounts" />
          </div>
          {!account.data.isActive && <Badge variant="secondary">Closed</Badge>}
        </div>
        <p className="text-muted-foreground">
          {paymentAccountTypeLabel(account.data.type)}
          {account.data.bankName ? ` · ${account.data.bankName}` : ""}
          {account.data.accountNumber ? ` · ${account.data.accountNumber}` : ""} ·{" "}
          {formatNaira(account.data.balance)} left of {formatNaira(account.data.openingBalance)}
        </p>
      </div>
      <PaymentAccountForm basePath="/dashboard/admin/expenditure" account={account.data} />
    </div>
  )
}
