import { BackButton } from "@/components/back-button"
import { getHrSetupData } from "@/app/actions/hr"
import { PayrollGenerateForm } from "@/components/hr/payroll-forms"

export default async function AdminGeneratePayrollPage() {
  const setup = await getHrSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr/payroll" />
        <h1 className="text-3xl font-bold tracking-tight">Generate Payroll</h1>
        <p className="text-muted-foreground">
          One run per month. Anyone without a salary on record is skipped and named.
        </p>
      </div>
      <PayrollGenerateForm basePath="/dashboard/admin/hr" sessions={setup.data.sessions} />
    </div>
  )
}
