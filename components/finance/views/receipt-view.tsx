import { notFound } from "next/navigation"

import { getReceipt } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedDocumentDownload, BrandedPrintHeader } from "@/components/reports/branded"
import type { PrintableDocument } from "@/components/reports/document-download"
import { PrintButton } from "@/components/reports/print-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain } from "@/lib/money"

export async function ReceiptView({ basePath, paymentId }: { basePath: string; paymentId: string }) {
  const receipt = await getReceipt(paymentId)

  if (!receipt.success) notFound()

  const data = receipt.data
  const paymentDate = new Date(data.paymentDate).toLocaleDateString()
  const paymentMethod = data.paymentMethod.replace("_", " ")
  const fileName = `receipt ${data.school.code} ${data.student.admissionNo} ${data.receiptNo}`

  const document: PrintableDocument = {
    title: "Official Receipt",
    reference: data.receiptNo,
    fileName,
    schoolName: data.school.name,
    schoolCode: data.school.code,
    fields: [
      { label: "Student", value: `${data.student.name} (${data.student.admissionNo})` },
      { label: "Class / Section", value: data.student.currentClass ?? "-" },
      { label: "Session / Term", value: `${data.term.sessionName} - ${data.term.name}` },
      { label: "Payment Date", value: paymentDate },
      { label: "Payment Method", value: paymentMethod },
      { label: "Reference", value: data.referenceNo ?? "-" },
      { label: "Received By", value: data.receivedBy ?? "-" },
    ],
    table: {
      caption: "Fee Items Paid",
      columns: ["Fee Item", "Amount"],
      rows: data.allocations.map((allocation) => [allocation.description, formatNairaPlain(allocation.amount)]),
    },
    totals: [
      { label: "Amount Paid", value: formatNairaPlain(data.amount) },
      { label: "Balance Remaining", value: formatNairaPlain(data.balanceRemaining) },
    ],
    signatureLabel: "Authorized Signature",
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:mx-0 print:max-w-none print:space-y-0" data-print-page>
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <BackButton fallbackHref={`${basePath}/receipts`} />
          <h1 className="text-3xl font-bold tracking-tight">Receipt</h1>
          <p className="text-muted-foreground">{data.receiptNo}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton label="Print Receipt" />
          <BrandedDocumentDownload document={document} label="Download PDF" />
        </div>
      </div>

      <Card data-print-document className="print:rounded-none print:border-0 print:shadow-none">
        <BrandedPrintHeader title="Official Receipt" reference={data.receiptNo} />
        <CardHeader className="border-b print:px-0 print:pb-4">
          <div className="flex items-start justify-between gap-4">
            {/* The screen's version of the letterhead. On paper BrandedPrintHeader carries
                it instead, with the logo and address, so this half is suppressed there —
                but the amount beside it must still print. */}
            <div className="print:hidden">
              <CardTitle>{data.school.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{data.school.code}</p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-foreground">Official Receipt</p>
              <p className="text-sm text-muted-foreground">{data.receiptNo}</p>
            </div>
            <div className="text-right print:w-full">
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="text-2xl font-bold">{formatNaira(data.amount)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6 print:px-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Student" value={`${data.student.name} (${data.student.admissionNo})`} />
            <Info label="Class / Section" value={data.student.currentClass ?? "-"} />
            <Info label="Session / Term" value={`${data.term.sessionName} · ${data.term.name}`} />
            <Info label="Payment Date" value={paymentDate} />
            <Info label="Payment Method" value={paymentMethod} />
            <Info label="Reference" value={data.referenceNo ?? "-"} />
            <Info label="Received By" value={data.receivedBy ?? "-"} />
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Fee Items Paid</h2>
            <div className="space-y-2">
              {data.allocations.map((allocation, index) => (
                <div key={`${allocation.description}-${index}`} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{allocation.description}</span>
                  <span className="font-medium">{formatNaira(allocation.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-muted p-4 text-right">
            <p className="text-sm text-muted-foreground">Student Balance Remaining</p>
            <p className="text-xl font-bold">{formatNaira(data.balanceRemaining)}</p>
          </div>

          <div className="grid gap-6 pt-8 sm:grid-cols-2">
            <div className="border-t pt-2">
              <p className="text-sm font-medium">Authorized Signature</p>
              <p className="text-xs text-muted-foreground">For school finance office use.</p>
            </div>
            <div className="border-t pt-2">
              <p className="text-sm font-medium">Parent / Student Acknowledgement</p>
              <p className="text-xs text-muted-foreground">Optional confirmation when printed.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
