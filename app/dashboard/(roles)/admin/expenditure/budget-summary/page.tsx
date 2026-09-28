import { BudgetSummaryView } from "@/components/expenditure/views/budget-summary-view"

export default async function AdminBudgetSummaryPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the report's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <BudgetSummaryView basePath="/dashboard/admin/expenditure" searchParams={await searchParams} />
}
