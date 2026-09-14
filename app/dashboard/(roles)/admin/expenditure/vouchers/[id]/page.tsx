import { VoucherView } from "@/components/expenditure/views/voucher-view"

export default async function AdminVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VoucherView basePath="/dashboard/admin/expenditure" expenseId={id} />
}
