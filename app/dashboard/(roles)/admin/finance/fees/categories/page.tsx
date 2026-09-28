import { FeeCategoriesView } from "@/components/finance/views/fee-categories-view"

export default async function FeeCategoriesPage({ searchParams }: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in
  // one place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <FeeCategoriesView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
