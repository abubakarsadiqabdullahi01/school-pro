import { HrReportsView } from "@/components/hr/views/hr-reports-view"

export default async function AdminHrReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>
}) {
  const { runId } = await searchParams
  return <HrReportsView basePath="/dashboard/admin/hr" runId={runId} />
}
