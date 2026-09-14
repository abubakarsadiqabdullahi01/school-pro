import { HrReportsView } from "@/components/hr/views/hr-reports-view"

export default async function AccountantHrReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>
}) {
  const { runId } = await searchParams
  return <HrReportsView basePath="/dashboard/accountant/hr" runId={runId} />
}
