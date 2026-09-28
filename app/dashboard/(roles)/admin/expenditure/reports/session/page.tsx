import { SessionExpenditureReportView } from "@/components/expenditure/views/session-report-view"

export default async function AdminSessionExpenditurePage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the report's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <SessionExpenditureReportView basePath="/dashboard/admin/expenditure" searchParams={await searchParams} />
  )
}
