import { notFound } from "next/navigation"

import { getFeeCategory } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FeeCategoryForm } from "@/components/finance/fee-category-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function EditFeeCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const category = await getFeeCategory(id)

  if (!category.success) notFound()

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/fees/categories" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{category.data.name}</h1>
          <InfoGuide guideKey="finance.fees" />
        </div>
        <p className="text-muted-foreground">
          {category.data.scheduleCount === 0
            ? "Nothing bills against this category yet."
            : `${category.data.scheduleCount} fee schedule${
                category.data.scheduleCount === 1 ? "" : "s"
              } report${
                category.data.scheduleCount === 1 ? "s" : ""
              } under this category, ${category.data.activeScheduleCount} of them active.`}
        </p>
      </div>
      <FeeCategoryForm basePath="/dashboard/admin/finance" category={category.data} />
    </div>
  )
}
