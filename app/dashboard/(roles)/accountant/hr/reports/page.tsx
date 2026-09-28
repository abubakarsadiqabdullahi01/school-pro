import { HrReportsView } from "@/components/hr/views/hr-reports-view"

export default async function AccountantHrReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <HrReportsView basePath="/dashboard/accountant/hr" searchParams={await searchParams} />
}
