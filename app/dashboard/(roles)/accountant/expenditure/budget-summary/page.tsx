import { BudgetSummaryView } from "@/components/expenditure/views/budget-summary-view"

export default async function AccountantBudgetSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <BudgetSummaryView basePath="/dashboard/accountant/expenditure" searchParams={await searchParams} />
}
