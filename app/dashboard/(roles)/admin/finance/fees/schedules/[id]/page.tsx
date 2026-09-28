import { FeeScheduleCoverageView } from "@/components/finance/views/fee-schedule-coverage-view"

export default async function FeeSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FeeScheduleCoverageView basePath="/dashboard/admin/finance" scheduleId={id} />
}
