import { StaffDirectoryView } from "@/components/hr/views/staff-directory-view"

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; department?: string; staffType?: string; employmentStatus?: string }>
}) {
  const filters = await searchParams
  return <StaffDirectoryView basePath="/dashboard/admin/hr" filters={filters} canManage />
}
