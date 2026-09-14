import { StaffFormView } from "@/components/hr/views/staff-form-view"

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StaffFormView basePath="/dashboard/admin/hr" staffId={id} />
}
