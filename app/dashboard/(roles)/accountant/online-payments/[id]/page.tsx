import { GatewayTransactionDetail } from "@/components/payments/gateway-transaction-detail"

export default async function AccountantOnlinePaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <GatewayTransactionDetail basePath="/dashboard/accountant" id={(await params).id} />
}
