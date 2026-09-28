import { getHrSetupData } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { PayComponentForm } from "@/components/hr/pay-component-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewAllowancePage() {
  // The names already taken, so the form can say so as it is typed rather than returning a
  // unique-constraint error on submit.
  const setup = await getHrSetupData()
  const takenNames = setup.success
    ? setup.data.allowanceTypes.map((type) => ({ id: type.id, name: type.name }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/hr/allowances" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Allowance</h1>
          <InfoGuide guideKey="hr.allowances" />
        </div>
        <p className="text-muted-foreground">
          Define it once here, then assign it to staff on their own records.
        </p>
      </div>
      <PayComponentForm basePath="/dashboard/admin/hr" kind="allowance" takenNames={takenNames} />
    </div>
  )
}
