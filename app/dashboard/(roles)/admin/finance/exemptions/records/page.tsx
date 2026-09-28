import { AdjustmentRecordsView } from "@/components/finance/views/adjustment-records-view"

export default async function ExemptionRecordsPage({
  searchParams,
}: {
  // Handed on whole: the period filters are checked in one place, so a page cannot
  // quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <AdjustmentRecordsView basePath="/dashboard/admin/finance" mode="exemption" searchParams={await searchParams} />
  )
}
