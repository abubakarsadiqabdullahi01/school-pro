import { PayrollRunView } from "@/components/hr/views/payroll-views"

export default async function AdminPayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PayrollRunView basePath="/dashboard/admin/hr" runId={id} canManage />
}
