import { ReceiptsView } from "@/components/finance/views/receipts-view"

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string; search?: string }>
}) {
  const { termId, search } = await searchParams
  return <ReceiptsView basePath="/dashboard/admin/finance" termId={termId} search={search} />
}
