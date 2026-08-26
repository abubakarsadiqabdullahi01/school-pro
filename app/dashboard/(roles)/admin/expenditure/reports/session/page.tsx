import { SessionExpenditureReportView } from "@/components/expenditure/views/session-report-view"

export default async function AdminSessionExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  return <SessionExpenditureReportView basePath="/dashboard/admin/expenditure" sessionId={sessionId} />
}
