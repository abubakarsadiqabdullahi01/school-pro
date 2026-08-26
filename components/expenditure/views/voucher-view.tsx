import { notFound } from "next/navigation"

import { getExpense } from "@/app/actions/expenditure"
import { ExpenseStatusBadge } from "@/components/expenditure/expense-status-badge"
import { DocumentDownload, type PrintableDocument } from "@/components/reports/document-download"
import { PrintButton } from "@/components/reports/print-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain } from "@/lib/money"

/**
 * The payment voucher — the piece of paper that leaves the finance office with the money.
 *
 * Deliberately shows the three signatures as named people rather than blank ruled lines:
 * the system already knows who did each part, and a printed voucher that says so is harder
 * to quietly alter than one signed after the fact.
 */
export async function VoucherView({ expenseId }: { expenseId: string }) {
  const result = await getExpense(expenseId)
  if (!result.success) notFound()

  const expense = result.data
  const expenseDate = new Date(expense.expenseDate).toLocaleDateString()
  const paidDate = expense.paidAt ? new Date(expense.paidAt).toLocaleDateString() : "—"

  const document: PrintableDocument = {
    title: "Payment Voucher",
    reference: expense.voucherNo,
    schoolName: expense.school.name,
    schoolCode: expense.school.code,
    fields: [
      { label: "Payee", value: `${expense.payeeName} (${expense.payeeType.toLowerCase()})` },
      { label: "Category", value: expense.categoryName },
      { label: "Expense Date", value: expenseDate },
      { label: "Paid From", value: expense.accountName },
      { label: "Payment Method", value: expense.paymentMethod.replace("_", " ") },
      { label: "Reference", value: expense.referenceNo ?? "-" },
      { label: "Session / Term", value: `${expense.sessionName} - ${expense.termName}` },
      { label: "Status", value: expense.status.replace("_", " ") },
    ],
    table: {
      caption: "Description",
      columns: ["Description", "Amount"],
      rows: [[expense.description, formatNairaPlain(expense.amount)]],
    },
    totals: [
      { label: "Recorded by", value: expense.recordedByName },
      { label: "Approved by", value: expense.approvedByName ?? "-" },
      { label: "Paid by", value: expense.paidByName ?? "-" },
      { label: "Total", value: formatNairaPlain(expense.amount) },
    ],
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Voucher</h1>
          <p className="text-muted-foreground">{expense.voucherNo}</p>
        </div>
        <div className="flex gap-2">
          <PrintButton label="Print Voucher" />
          <DocumentDownload document={document} label="Download PDF" />
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{expense.school.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{expense.school.code}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-bold">{formatNaira(expense.amount)}</p>
              <div className="mt-1 flex justify-end"><ExpenseStatusBadge status={expense.status} /></div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Voucher No" value={expense.voucherNo} />
            <Info label="Payee" value={`${expense.payeeName} (${expense.payeeType.toLowerCase()})`} />
            <Info label="Category" value={expense.categoryName} />
            <Info label="Paid From" value={expense.accountName} />
            <Info label="Expense Date" value={expenseDate} />
            <Info label="Date Paid" value={paidDate} />
            <Info label="Payment Method" value={expense.paymentMethod.replace("_", " ")} />
            <Info label="Reference" value={expense.referenceNo ?? "—"} />
          </div>

          <div>
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="rounded-md bg-muted p-3">{expense.description}</p>
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
            <Info label="Recorded by" value={expense.recordedByName} />
            <Info label="Approved by" value={expense.approvedByName ?? "—"} />
            <Info label="Paid by" value={expense.paidByName ?? "—"} />
          </div>

          <div className="rounded-md bg-muted p-4 text-right">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-xl font-bold">{formatNaira(expense.amount)}</p>
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
