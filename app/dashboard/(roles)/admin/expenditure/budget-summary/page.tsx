import { BudgetSummaryView } from "@/components/expenditure/views/budget-summary-view"

export default async function AdminBudgetSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  return <BudgetSummaryView basePath="/dashboard/admin/expenditure" sessionId={sessionId} />
}
