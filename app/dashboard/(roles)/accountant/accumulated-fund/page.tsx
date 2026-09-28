import { AccumulatedFundView } from "@/components/finance/views/accumulated-fund-view"

export default async function AccountantAccumulatedFundPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the period filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <AccumulatedFundView basePath="/dashboard/accountant" searchParams={await searchParams} />
}
