import { PayslipView } from "@/components/hr/views/payroll-views"

export default async function AdminPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PayslipView basePath="/dashboard/admin/hr" itemId={id} />
}
