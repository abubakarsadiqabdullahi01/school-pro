import { StaffDetailView } from "@/components/hr/views/staff-detail-view"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"

export default async function AdminStaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const canCreateTeacherLogin = (await getEffectivePermissionsForCurrentUser()).includes("teachers.manage")
  return (
    <StaffDetailView
      basePath="/dashboard/admin/hr"
      staffId={id}
      canManage
      canCreateTeacherLogin={canCreateTeacherLogin}
    />
  )
}
