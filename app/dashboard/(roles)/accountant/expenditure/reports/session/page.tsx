import { SessionExpenditureReportView } from "@/components/expenditure/views/session-report-view"

export default async function AccountantSessionExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <SessionExpenditureReportView
      basePath="/dashboard/accountant/expenditure"
      searchParams={await searchParams}
    />
  )
}
