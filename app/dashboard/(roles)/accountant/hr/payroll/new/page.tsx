import { BackButton } from "@/components/back-button"
import { getHrSetupData, getPayrollRuns } from "@/app/actions/hr"
import { PayrollGenerateForm } from "@/components/hr/payroll-forms"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AccountantGeneratePayrollPage() {
  // The runs already on record, so the form can rule out a month before it is submitted
  // rather than offering it and then refusing.
  const [setup, runs] = await Promise.all([getHrSetupData(), getPayrollRuns()])

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/accountant/hr/payroll" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Generate Payroll</h1>
          <InfoGuide guideKey="hr.payroll" />
        </div>
        <p className="text-muted-foreground">
          One run per month. Anyone without a salary on record is skipped and named.
        </p>
      </div>
      <PayrollGenerateForm
        basePath="/dashboard/accountant/hr"
        sessions={setup.data.sessions}
        existingRuns={runs.success ? runs.data : []}
      />
    </div>
  )
}
