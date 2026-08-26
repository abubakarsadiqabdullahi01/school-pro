import { notFound } from "next/navigation"

import { getReceipt } from "@/app/actions/finance"
import { FinanceDocumentDownload, type FinanceDocument } from "@/components/finance/finance-document-download"
import { PrintButton } from "@/components/finance/print-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain } from "@/lib/money"

export async function ReceiptView({ paymentId }: { paymentId: string }) {
  const receipt = await getReceipt(paymentId)

  if (!receipt.success) notFound()

  const data = receipt.data
  const paymentDate = new Date(data.paymentDate).toLocaleDateString()
  const paymentMethod = data.paymentMethod.replace("_", " ")

  const document: FinanceDocument = {
    title: "Receipt",
    reference: data.receiptNo,
    schoolName: data.school.name,
    schoolCode: data.school.code,
    fields: [
      { label: "Student", value: `${data.student.name} (${data.student.admissionNo})` },
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
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Receipt</h1>
          <p className="text-muted-foreground">{data.receiptNo}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton label="Print Receipt" />
          <FinanceDocumentDownload document={document} label="Download PDF" />
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{data.school.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{data.school.code}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="text-2xl font-bold">{formatNaira(data.amount)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Student" value={`${data.student.name} (${data.student.admissionNo})`} />
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
