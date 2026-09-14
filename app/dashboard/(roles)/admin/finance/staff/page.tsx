import { BackButton } from "@/components/back-button"
import { getFinanceOfficers } from "@/app/actions/finance"
import { FinanceStaffForm } from "@/components/finance/finance-staff-form"

// Admin tree only. Assigning finance staff is the admin's call, so this page has no
// counterpart under /dashboard/accountant.
export default async function FinanceStaffPage() {
  const officers = await getFinanceOfficers()

  if (!officers.success) {
    return <p className="text-destructive">{officers.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance" />
        <h1 className="text-3xl font-bold tracking-tight">Finance Staff</h1>
        <p className="text-muted-foreground">Assign an accountant to run fee collection on the school&apos;s behalf.</p>
      </div>
      <FinanceStaffForm officers={officers.data} />
    </div>
  )
}
