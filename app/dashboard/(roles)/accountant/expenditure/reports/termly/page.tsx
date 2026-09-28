import { TermlyExpenditureReportView } from "@/components/expenditure/views/termly-report-view"

export default async function AccountantTermlyExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <TermlyExpenditureReportView
      basePath="/dashboard/accountant/expenditure"
      searchParams={await searchParams}
    />
  )
}
