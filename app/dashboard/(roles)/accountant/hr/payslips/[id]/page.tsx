import { PayslipView } from "@/components/hr/views/payroll-views"

export default async function AccountantPayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PayslipView basePath="/dashboard/accountant/hr" itemId={id} />
}
