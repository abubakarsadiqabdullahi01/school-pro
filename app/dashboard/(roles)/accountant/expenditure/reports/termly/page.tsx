import { TermlyExpenditureReportView } from "@/components/expenditure/views/termly-report-view"

export default async function AccountantTermlyExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>
}) {
  const { termId } = await searchParams
  return <TermlyExpenditureReportView basePath="/dashboard/accountant/expenditure" termId={termId} />
}
