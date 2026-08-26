import { ReceiptView } from "@/components/finance/views/receipt-view"

export default async function AccountantReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReceiptView paymentId={id} />
}
