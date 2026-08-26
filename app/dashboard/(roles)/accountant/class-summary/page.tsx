import { ClassSummaryView } from "@/components/finance/views/class-summary-view"

export default async function AccountantClassSummaryPage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  const { termId } = await searchParams
  return <ClassSummaryView basePath="/dashboard/accountant" termId={termId} />
}
