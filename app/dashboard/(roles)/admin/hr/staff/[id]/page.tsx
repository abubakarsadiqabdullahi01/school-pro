import { StaffDetailView } from "@/components/hr/views/staff-detail-view"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"

export default async function AdminStaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const permissions = await getEffectivePermissionsForCurrentUser()
  return (
    <StaffDetailView
      basePath="/dashboard/admin/hr"
      staffId={id}
      canManage
      canCreateTeacherLogin={permissions.includes("teachers.manage")}
      canCreateAccountantLogin={permissions.includes("finance.setup")}
    />
  )
}
