import { notFound } from "next/navigation"

import { getStudentStatement } from "@/app/actions/finance"
import { FinanceDocumentDownload, type FinanceDocument } from "@/components/finance/finance-document-download"
import { PrintButton } from "@/components/finance/print-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain } from "@/lib/money"

export async function StudentStatementView({ studentId }: { studentId: string }) {
  const statement = await getStudentStatement(studentId)

  if (!statement.success) notFound()

  const { school, student, totals, charges, payments } = statement.data
  const adjustments = String(Number(totals.discounts) + Number(totals.exemptions))

  const document: FinanceDocument = {
    title: "Statement of Account",
    reference: `${student.name} ${student.admissionNo}`,
    schoolName: school.name,
    schoolCode: school.code,
    fields: [
      { label: "Student", value: student.name },
      { label: "Admission No", value: student.admissionNo },
      { label: "Total Charged", value: formatNairaPlain(totals.charged) },
      { label: "Total Paid", value: formatNairaPlain(totals.paid) },
    ],
    table: {
      caption: "Charges",
      columns: ["Fee", "Amount", "Paid", "Balance", "Status"],
      rows: charges.map((charge) => [
        charge.description,
        formatNairaPlain(charge.amount),
        formatNairaPlain(charge.paid),
        formatNairaPlain(charge.balance),
        charge.status,
      ]),
    },
    totals: [
      { label: "Adjustments", value: formatNairaPlain(adjustments) },
      { label: "Balance Due", value: formatNairaPlain(totals.balance) },
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statement of Account</h1>
          <p className="text-muted-foreground">{student.name} · {student.admissionNo}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton label="Print Statement" />
          <FinanceDocumentDownload document={document} label="Download PDF" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Summary label="Charged" value={totals.charged} />
        <Summary label="Paid" value={totals.paid} />
        <Summary label="Adjustments" value={adjustments} />
        <Summary label="Balance" value={totals.balance} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
          <CardDescription>Scheduled fees, payments, and balances.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Fee</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Paid</th>
                <th className="py-2 pr-4 font-medium">Balance</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">{charge.description}</td>
                  <td className="py-3 pr-4">{formatNaira(charge.amount)}</td>
                  <td className="py-3 pr-4">{formatNaira(charge.paid)}</td>
                  <td className="py-3 pr-4">{formatNaira(charge.balance)}</td>
                  <td className="py-3 pr-4">{charge.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {charges.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No fees have been charged to this student.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Every receipt raised against this student, most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Receipt</th>
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td className="py-3 pr-4 font-medium">{payment.receiptNo}</td>
                  <td className="py-3 pr-4">{payment.method.replace("_", " ")}</td>
                  <td className="py-3 pr-4">{payment.status}</td>
                  <td className="py-3 pr-4">{formatNaira(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{formatNaira(value, { kobo: false })}</CardContent>
    </Card>
  )
}
