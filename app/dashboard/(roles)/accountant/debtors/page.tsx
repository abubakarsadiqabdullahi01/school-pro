import { DebtorsView } from "@/components/finance/views/debtors-view"
import type { DebtorsFilterValues } from "@/components/finance/debtors-filter"

export default async function AccountantDebtorsPage({ searchParams }: { searchParams: Promise<DebtorsFilterValues> }) {
  const filters = await searchParams
  return <DebtorsView basePath="/dashboard/accountant" filters={filters} />
}
