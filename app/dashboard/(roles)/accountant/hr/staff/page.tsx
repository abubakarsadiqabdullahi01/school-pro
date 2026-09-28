import { StaffDirectoryView } from "@/components/hr/views/staff-directory-view"

export default async function AccountantStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <StaffDirectoryView
      basePath="/dashboard/accountant/hr"
      searchParams={await searchParams}
      canManage={false}
    />
  )
}
