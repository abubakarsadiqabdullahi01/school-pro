import { VoucherView } from "@/components/expenditure/views/voucher-view"

export default async function AccountantVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VoucherView basePath="/dashboard/accountant/expenditure" expenseId={id} />
}
