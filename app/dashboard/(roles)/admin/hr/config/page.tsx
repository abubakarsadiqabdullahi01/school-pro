import { BackButton } from "@/components/back-button"
import { getHrSetupData } from "@/app/actions/hr"
import { HrConfigForm } from "@/components/hr/hr-config-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function HrConfigPage() {
  const setup = await getHrSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">HR Settings</h1>
          <InfoGuide guideKey="hr.config" />
        </div>
        <p className="text-muted-foreground">Staff numbering, and how payroll behaves for this school.</p>
      </div>
      <HrConfigForm config={setup.data.config} accounts={setup.data.accounts} />
    </div>
  )
}
