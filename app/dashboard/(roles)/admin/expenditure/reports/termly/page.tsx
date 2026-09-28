import { TermlyExpenditureReportView } from "@/components/expenditure/views/termly-report-view"

export default async function AdminTermlyExpenditurePage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the report's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <TermlyExpenditureReportView basePath="/dashboard/admin/expenditure" searchParams={await searchParams} />
  )
}
