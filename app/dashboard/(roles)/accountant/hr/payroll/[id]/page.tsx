import { PayrollRunView } from "@/components/hr/views/payroll-views"

export default async function AccountantPayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PayrollRunView basePath="/dashboard/accountant/hr" runId={id} canManage={false} />
}
