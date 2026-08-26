import { ExpenditureTransactionsView } from "@/components/expenditure/views/transactions-view"
import type { ExpenditureFilterValues } from "@/components/expenditure/expenditure-filter"

export default async function AdminExpenditureTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<ExpenditureFilterValues>
}) {
  const filters = await searchParams
  return <ExpenditureTransactionsView basePath="/dashboard/admin/expenditure" filters={filters} />
}
