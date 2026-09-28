import { notFound } from "next/navigation"

import { getMyReceipt } from "@/app/actions/portal-receipt"
import { ReceiptView } from "@/components/finance/views/receipt-view"

export const metadata = { title: "Receipt" }

export default async function StudentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  const { paymentId } = await params

  // The action carries the authorization: it answers only for a payment belonging to the
  // signed-in student.
  const receipt = await getMyReceipt(paymentId)
  if (!receipt.success) notFound()

  return (
    <ReceiptView
      basePath="/dashboard/student/fees"
      paymentId={paymentId}
      data={receipt.data}
      canRefund={false}
    />
  )
}
