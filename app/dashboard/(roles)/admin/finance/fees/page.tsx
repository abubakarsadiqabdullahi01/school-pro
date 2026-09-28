import { FeeSchedulesView } from "@/components/finance/views/fee-schedules-view"

export default async function FinanceFeesPage({ searchParams }: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in
  // one place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <FeeSchedulesView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
