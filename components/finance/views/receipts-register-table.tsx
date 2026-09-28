"use client"

import Link from "next/link"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Button } from "@/components/ui/button"
import { paymentMethodLabel } from "@/lib/finance/payment-method"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

export type ReceiptRegisterRow = {
  id: string
  receiptNo: string
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  amount: string
  paymentDate: string
  method: string
  status: string
  receivedByName: string | null
}

// The seven printed columns total 100%, so the register fills the page rather than stopping
// short of the right margin. Actions is a length instead: it holds two buttons of a size the
// page width has no say over, and as a percentage it was either too narrow on screen — the
// buttons wrapped and every row grew a second line — or wasteful on paper. Its width sits
// outside the 100% and the browser divides what is left between the rest, which is also why
// the table keeps a minimum width: below it the columns would be squeezed into each other,
// so the table scrolls sideways instead. The student column is the only one meant to wrap.
const columns: DataTableColumn[] = [
  { label: "Date", width: "12%" },
  { label: "Receipt No", width: "16%" },
  { label: "Student", width: "26%" },
  { label: "Class", width: "8%" },
  { label: "Method", width: "13%" },
  { label: "Amount", align: "right", width: "13%" },
  { label: "Received By", width: "12%" },
  { label: "Actions", printHidden: true, width: "11rem" },
]

export function ReceiptsRegisterTable({
  basePath,
  rows,
  emptyMessage = "No receipts have been issued yet.",
}: {
  basePath: string
  rows: ReceiptRegisterRow[]
  /** What an empty register means here — usually that the filters excluded everything. */
  emptyMessage?: string
}) {
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    search: [
      row.receiptNo,
      row.studentName,
      row.admissionNo,
      row.className ?? "",
      row.method,
      row.status,
      row.receivedByName ?? "",
    ].join(" "),
    // Keyed because React checks the elements of a list for keys, and every cell here is
    // an element rather than a bare string.
    cells: [
      <span key="date" className="whitespace-nowrap">
        {formatDocumentDate(row.paymentDate)}
      </span>,
      <Link
        key="receipt"
        href={`${basePath}/receipts/${row.id}`}
        className="whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.receiptNo}
      </Link>,
      <div key="student" className="min-w-0">
        <div className="font-medium">{row.studentName}</div>
        <div className="text-xs text-muted-foreground">{row.admissionNo}</div>
      </div>,
      <span key="class" className="whitespace-nowrap">
        {row.className ?? "-"}
      </span>,
      <span key="method" className="whitespace-nowrap">
        {paymentMethodLabel(row.method)}
      </span>,
      <span key="amount" className="whitespace-nowrap font-semibold tabular-nums">
        {formatNaira(row.amount)}
      </span>,
      <span key="received" className="whitespace-nowrap">
        {row.receivedByName ?? "-"}
      </span>,
      // Compact enough for both buttons to sit on one line in the width the column has;
      // at the default size they wrapped and every row in the register grew a second line.
      <div key="actions" className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
          <Link href={`${basePath}/receipts/${row.id}`}>Receipt</Link>
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
          <Link href={`${basePath}/students/${row.studentId}/statement`}>Statement</Link>
        </Button>
      </div>,
    ],
  }))

  return (
    <DataTable
      columns={columns}
      rows={tableRows}
      unit="receipts"
      searchPlaceholder="Search receipt number, student, method or cashier"
      emptyMessage={emptyMessage}
      noMatchMessage="No receipts match the current search."
    />
  )
}
