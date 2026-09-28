import { DebtorsView } from "@/components/finance/views/debtors-view"

export default async function DebtorsPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the filters are checked in one place,
  // so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <DebtorsView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
