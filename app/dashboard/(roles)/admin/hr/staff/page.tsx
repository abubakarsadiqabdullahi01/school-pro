import { StaffDirectoryView } from "@/components/hr/views/staff-directory-view"

export default async function AdminStaffPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <StaffDirectoryView basePath="/dashboard/admin/hr" searchParams={await searchParams} canManage />
}
