import { AccumulatedFundView } from "@/components/finance/views/accumulated-fund-view"

export default async function AccountantAccumulatedFundPage({ searchParams }: { searchParams: Promise<{ sessionId?: string }> }) {
  const { sessionId } = await searchParams
  return <AccumulatedFundView basePath="/dashboard/accountant" sessionId={sessionId} />
}
