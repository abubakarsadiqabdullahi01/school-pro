import { StaffDetailView } from "@/components/hr/views/staff-detail-view"

export default async function AdminStaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StaffDetailView basePath="/dashboard/admin/hr" staffId={id} canManage />
}
