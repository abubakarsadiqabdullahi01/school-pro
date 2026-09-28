import { ClassSummaryView } from "@/components/finance/views/class-summary-view"

export default async function ClassSummaryPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the period filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <ClassSummaryView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
