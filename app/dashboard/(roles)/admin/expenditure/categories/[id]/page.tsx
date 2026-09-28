import { notFound } from "next/navigation"

import { getExpenseCategory } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { ExpenseCategoryForm } from "@/components/expenditure/expense-category-form"
import { Badge } from "@/components/ui/badge"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatNaira } from "@/lib/money"

export default async function ExpenseCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const category = await getExpenseCategory(id)

  if (!category.success) notFound()

  const { data } = category

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/expenditure/categories" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <InfoGuide guideKey="expenditure.categories" />
          {!data.isActive && <Badge variant="secondary">Retired</Badge>}
        </div>
        <p className="text-muted-foreground">
          {data.budgetLimit
            ? `${formatNaira(data.termSpend)} spent against a ${formatNaira(data.budgetLimit)} limit${
                data.termName ? ` in ${data.termName}` : ""
              }`
            : `${formatNaira(data.totalSpent)} paid under this heading, with no ceiling set`}{" "}
          · {data.expenseCount} voucher{data.expenseCount === 1 ? "" : "s"}
        </p>
      </div>
      <ExpenseCategoryForm basePath="/dashboard/admin/expenditure" category={data} />
    </div>
  )
}
