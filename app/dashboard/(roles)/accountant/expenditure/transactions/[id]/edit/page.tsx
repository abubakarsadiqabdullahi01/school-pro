import { ExpenseFormView } from "@/components/expenditure/views/expense-form-view"

export default async function AccountantEditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ExpenseFormView basePath="/dashboard/accountant/expenditure" expenseId={id} />
}
