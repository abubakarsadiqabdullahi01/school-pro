import { SalaryScalesView } from "@/components/hr/views/salary-scales-view"

export default async function SalaryScalesPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <SalaryScalesView basePath="/dashboard/admin/hr" searchParams={await searchParams} canManage />
}
