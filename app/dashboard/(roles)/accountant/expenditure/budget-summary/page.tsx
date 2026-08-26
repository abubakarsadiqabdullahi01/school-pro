import { BudgetSummaryView } from "@/components/expenditure/views/budget-summary-view"

export default async function AccountantBudgetSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  return <BudgetSummaryView basePath="/dashboard/accountant/expenditure" sessionId={sessionId} />
}
