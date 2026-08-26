import { AccumulatedFundView } from "@/components/finance/views/accumulated-fund-view"

export default async function AccumulatedFundPage({ searchParams }: { searchParams: Promise<{ sessionId?: string }> }) {
  const { sessionId } = await searchParams
  return <AccumulatedFundView basePath="/dashboard/admin/finance" sessionId={sessionId} />
}
