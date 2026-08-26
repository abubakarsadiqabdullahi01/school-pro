import { ClassSummaryView } from "@/components/finance/views/class-summary-view"

export default async function ClassSummaryPage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  const { termId } = await searchParams
  return <ClassSummaryView basePath="/dashboard/admin/finance" termId={termId} />
}
