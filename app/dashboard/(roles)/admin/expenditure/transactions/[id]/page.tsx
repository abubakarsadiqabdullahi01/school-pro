import { ExpenseDetailView } from "@/components/expenditure/views/expense-detail-view"

export default async function AdminExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ExpenseDetailView basePath="/dashboard/admin/expenditure" expenseId={id} canManage />
}
