import { BackButton } from "@/components/back-button"
import { getExpenditureSetupData } from "@/app/actions/expenditure"
import { ExpenseCategoriesForm } from "@/components/expenditure/expenditure-setup-forms"

// Admin tree only. Configuring categories is the admin's authority, and createExpenseCategory
// rejects an accountant regardless of the URL reached.
export default async function ExpenseCategoriesPage() {
  const setup = await getExpenditureSetupData()

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure" />
        <h1 className="text-3xl font-bold tracking-tight">Expense Categories</h1>
        <p className="text-muted-foreground">What the school spends money on, and an optional termly budget.</p>
      </div>
      <ExpenseCategoriesForm categories={setup.data.categories} />
    </div>
  )
}
