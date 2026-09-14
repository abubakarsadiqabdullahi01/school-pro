import { BackButton } from "@/components/back-button"
import { getHrSetupData } from "@/app/actions/hr"
import { SalaryScalesForm } from "@/components/hr/hr-setup-forms"

export default async function SalaryScalesPage() {
  const setup = await getHrSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr" />
        <h1 className="text-3xl font-bold tracking-tight">Salary Scales</h1>
        <p className="text-muted-foreground">Standard levels a salary can be based on.</p>
      </div>
      <SalaryScalesForm scales={setup.data.scales} />
    </div>
  )
}
