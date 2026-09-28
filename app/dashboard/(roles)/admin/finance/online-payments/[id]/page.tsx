import { GatewayTransactionDetail } from "@/components/payments/gateway-transaction-detail"

export default async function AdminOnlinePaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <GatewayTransactionDetail basePath="/dashboard/admin/finance" id={(await params).id} />
}
