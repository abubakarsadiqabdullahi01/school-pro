import { notFound } from "next/navigation"

import { getChildReceipt } from "@/app/actions/portal-receipt"
import { ReceiptView } from "@/components/finance/views/receipt-view"

export const metadata = { title: "Receipt" }

export default async function ParentChildReceiptPage({
  params,
}: {
  params: Promise<{ studentId: string; paymentId: string }>
}) {
  const { studentId, paymentId } = await params

  // The action carries the authorization: the child must be linked to the signed-in parent
  // and the payment must belong to that child.
  const receipt = await getChildReceipt(studentId, paymentId)
  if (!receipt.success) notFound()

  return (
    <ReceiptView
      basePath={`/dashboard/parent/children/${studentId}/fees`}
      paymentId={paymentId}
      data={receipt.data}
      canRefund={false}
    />
  )
}
