import { notFound } from "next/navigation"
import Link from "next/link"

import { getStudentStatement } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedDocumentDownload, BrandedPrintHeader } from "@/components/reports/branded"
import type { PrintableDocument } from "@/components/reports/document-download"
import { PrintButton } from "@/components/reports/print-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain } from "@/lib/money"

export async function StudentStatementView({
  basePath,
  studentId,
}: {
  /** Which finance tree this is rendered under, so receipt links stay inside it. */
  basePath: string
  studentId: string
}) {
  const statement = await getStudentStatement(studentId)

  if (!statement.success) notFound()

  const { school, student, totals, charges, payments } = statement.data
  const adjustments = String(Number(totals.discounts) + Number(totals.exemptions))

  const document: PrintableDocument = {
    title: "Statement of Account",
    reference: `${student.name} ${student.admissionNo}`,
    schoolName: school.name,
    schoolCode: school.code,
    fields: [
      { label: "Student", value: student.name },
      { label: "Admission No", value: student.admissionNo },
      { label: "Class / Section", value: student.currentClass ?? "-" },
      { label: "Term", value: student.currentTerm ?? "-" },
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
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader
        title="Statement of Account"
        reference={`${student.name} · ${student.admissionNo}`}
      />
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Statement of Account</h1>
          <p className="text-muted-foreground">
            {student.name} · {student.admissionNo} · {student.currentClass ?? "No class"} · {student.currentTerm ?? "No term"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton label="Print Statement" />
          <BrandedDocumentDownload document={document} label="Download PDF" />
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
          <CardTitle>Student Details</CardTitle>
          <CardDescription>Class, section, and term context for this statement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Detail label="Student" value={student.name} />
          <Detail label="Admission No" value={student.admissionNo} />
          <Detail label="Class / Section" value={student.currentClass ?? "-"} />
          <Detail label="Term" value={student.currentTerm ?? "-"} />
          <Detail label="School" value={`${school.name} (${school.code})`} />
        </CardContent>
      </Card>

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
                  <td className="py-3 pr-4 font-medium">
                    <Link
                      className="text-primary underline-offset-4 hover:underline print:text-inherit"
                      href={`${basePath}/receipts/${payment.id}`}
                    >
                      {payment.receiptNo}
                    </Link>
                  </td>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
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
