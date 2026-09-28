"use client"

import Link from "next/link"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Button } from "@/components/ui/button"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira } from "@/lib/money"

export type DebtorsTableRow = {
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  totalFees: string
  totalPaid: string
  discounts: string
  exemptions: string
  balance: string
  lastPaymentDate: string | null
  parentContact: string | null
}

// Sized so the printed list is laid out rather than squeezed: the seven printed columns
// share the width the action buttons do not take, and only the student column wraps.
const columns: DataTableColumn[] = [
  { label: "Student", width: "19%" },
  { label: "Class", width: "8%" },
  { label: "Billed", align: "right", width: "12%" },
  { label: "Paid", align: "right", width: "11%" },
  { label: "Adjustments", align: "right", width: "10%" },
  { label: "Balance", align: "right", width: "12%" },
  { label: "Last Payment", width: "12%" },
  // A phone number is the point of the column — it is what the school rings — so it gets
  // the room to print whole rather than being clipped behind the buttons.
  { label: "Parent Contact", width: "16%" },
  { label: "", printHidden: true, width: "11rem" },
]

export function DebtorsTable({
  basePath,
  rows,
  emptyMessage,
}: {
  basePath: string
  rows: DebtorsTableRow[]
  emptyMessage?: string
}) {
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.studentId,
    href: `${basePath}/students/${row.studentId}/statement`,
    search: [row.studentName, row.admissionNo, row.className ?? "", row.parentContact ?? ""].join(" "),
    cells: [
      <div key="student" className="min-w-0">
        <div className="font-medium">{row.studentName}</div>
        <div className="text-xs text-muted-foreground">{row.admissionNo}</div>
      </div>,
      <span key="class" className="whitespace-nowrap">
        {row.className ?? "-"}
      </span>,
      <span key="billed" className="whitespace-nowrap">
        {formatNaira(row.totalFees)}
      </span>,
      <span key="paid" className="whitespace-nowrap">
        {formatNaira(row.totalPaid)}
      </span>,
      // Discounts and exemptions are one column on screen: whoever is chasing a balance
      // cares that something was taken off, not which of the two it was.
      <span key="adjustments" className="whitespace-nowrap">
        {formatNaira(Number(row.discounts) + Number(row.exemptions))}
      </span>,
      <span key="balance" className="whitespace-nowrap font-semibold">
        {formatNaira(row.balance)}
      </span>,
      <span key="last" className="whitespace-nowrap text-muted-foreground">
        {row.lastPaymentDate ? formatDocumentDate(row.lastPaymentDate) : "Never"}
      </span>,
      <span key="contact" className="whitespace-nowrap">
        {row.parentContact ?? "-"}
      </span>,
      <div key="actions" className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
          <Link href={`${basePath}/students/${row.studentId}/statement`}>Statement</Link>
        </Button>
        <Button size="sm" className="h-7 px-2 text-xs" asChild>
          <Link href={`${basePath}/student-payments?studentId=${row.studentId}`}>Pay</Link>
        </Button>
      </div>,
    ],
  }))

  return (
    <DataTable
      columns={columns}
      rows={tableRows}
      unit="debtors"
      searchable={false}
      emptyMessage={emptyMessage ?? "Nobody owes anything."}
    />
  )
}
