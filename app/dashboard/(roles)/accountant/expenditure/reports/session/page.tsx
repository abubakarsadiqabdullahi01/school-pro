import { SessionExpenditureReportView } from "@/components/expenditure/views/session-report-view"

export default async function AccountantSessionExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  return <SessionExpenditureReportView basePath="/dashboard/accountant/expenditure" sessionId={sessionId} />
}
