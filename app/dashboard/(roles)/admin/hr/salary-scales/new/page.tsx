import { getHrSetupData } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { SalaryScaleForm } from "@/components/hr/salary-scale-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewSalaryScalePage() {
  // The names already taken, so the form can say so as it is typed rather than returning a
  // unique-constraint error on submit.
  const setup = await getHrSetupData()
  const takenNames = setup.success ? setup.data.scales.map((scale) => ({ id: scale.id, name: scale.name })) : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr/salary-scales" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Salary Scale</h1>
          <InfoGuide guideKey="hr.salaryScales" />
        </div>
        <p className="text-muted-foreground">
          A standard level a salary can be based on. Create this before assigning it to anybody.
        </p>
      </div>
      <SalaryScaleForm basePath="/dashboard/admin/hr" takenNames={takenNames} />
    </div>
  )
}
