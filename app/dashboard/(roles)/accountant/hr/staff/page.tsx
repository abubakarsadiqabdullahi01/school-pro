import { StaffDirectoryView } from "@/components/hr/views/staff-directory-view"

export default async function AccountantStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; department?: string; staffType?: string; employmentStatus?: string }>
}) {
  const filters = await searchParams
  return <StaffDirectoryView basePath="/dashboard/accountant/hr" filters={filters} canManage={false} />
}
