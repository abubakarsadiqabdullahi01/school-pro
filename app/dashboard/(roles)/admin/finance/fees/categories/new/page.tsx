import { getFeeCategories } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FeeCategoryForm } from "@/components/finance/fee-category-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewFeeCategoryPage() {
  // The names already taken, so the form can say so as it is typed rather than returning
  // a unique-constraint error on submit.
  const categories = await getFeeCategories()
  const takenNames = categories.success
    ? categories.data.rows.map((row) => ({ id: row.id, name: row.name }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/fees/categories" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Fee Category</h1>
          <InfoGuide guideKey="finance.fees" />
        </div>
        <p className="text-muted-foreground">
          A heading fees are grouped and reported under. Create this before the schedule that names it.
        </p>
      </div>
      <FeeCategoryForm basePath="/dashboard/admin/finance" takenNames={takenNames} />
    </div>
  )
}
