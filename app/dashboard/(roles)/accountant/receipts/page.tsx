import { ReceiptsView } from "@/components/finance/views/receipts-view"

export default async function AccountantReceiptsPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the register's filters are
  // checked in one place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <ReceiptsView basePath="/dashboard/accountant" searchParams={await searchParams} />
}
