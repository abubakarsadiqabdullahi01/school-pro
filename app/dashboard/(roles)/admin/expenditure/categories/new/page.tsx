import { getExpenseCategories } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { ExpenseCategoryForm } from "@/components/expenditure/expense-category-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewExpenseCategoryPage() {
  // The names already taken, so the form can say so as it is typed rather than returning a
  // unique-constraint error on submit.
  const categories = await getExpenseCategories()
  const takenNames = categories.success
    ? categories.data.rows.map((row) => ({ id: row.id, name: row.name }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure/categories" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">New Expense Category</h1>
          <InfoGuide guideKey="expenditure.categories" />
        </div>
        <p className="text-muted-foreground">
          A heading spending is grouped and reported under. Create this before the first voucher that names it.
        </p>
      </div>
      <ExpenseCategoryForm basePath="/dashboard/admin/expenditure" takenNames={takenNames} />
    </div>
  )
}
