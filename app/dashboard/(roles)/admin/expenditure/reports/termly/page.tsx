import { TermlyExpenditureReportView } from "@/components/expenditure/views/termly-report-view"

export default async function AdminTermlyExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>
}) {
  const { termId } = await searchParams
  return <TermlyExpenditureReportView basePath="/dashboard/admin/expenditure" termId={termId} />
}
