import { ExpenseDetailView } from "@/components/expenditure/views/expense-detail-view"

export default async function AccountantExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ExpenseDetailView basePath="/dashboard/accountant/expenditure" expenseId={id} canManage={false} />
}
