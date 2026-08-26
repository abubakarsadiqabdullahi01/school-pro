import { ExpenseFormView } from "@/components/expenditure/views/expense-form-view"

export default async function AdminEditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ExpenseFormView basePath="/dashboard/admin/expenditure" expenseId={id} />
}
