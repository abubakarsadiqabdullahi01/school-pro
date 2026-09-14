import { ReceiptsView } from "@/components/finance/views/receipts-view"

export default async function AccountantReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string; search?: string }>
}) {
  const { termId, search } = await searchParams
  return <ReceiptsView basePath="/dashboard/accountant" termId={termId} search={search} />
}
