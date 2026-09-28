import { HrReportsView } from "@/components/hr/views/hr-reports-view"

export default async function AdminHrReportsPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the tab and the payroll run are read in
  // one place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <HrReportsView basePath="/dashboard/admin/hr" searchParams={await searchParams} />
}
