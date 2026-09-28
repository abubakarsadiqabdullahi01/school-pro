import type { Metadata } from "next"

import { getReceipt } from "@/app/actions/finance"
import { ReceiptView } from "@/components/finance/views/receipt-view"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const receipt = await getReceipt(id)

  if (!receipt.success) {
    return { title: "Receipt | DigiSchool-Pro" }
  }

  const { receiptNo, student, school } = receipt.data
  return {
    title: `Official Receipt ${receiptNo} - ${student.admissionNo} | ${school.code}`,
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReceiptView basePath="/dashboard/admin/finance/receipts" paymentId={id} />
}
