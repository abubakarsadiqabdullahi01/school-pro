import { StaffDetailView } from "@/components/hr/views/staff-detail-view"

export default async function AccountantStaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StaffDetailView basePath="/dashboard/accountant/hr" staffId={id} canManage={false} />
}
