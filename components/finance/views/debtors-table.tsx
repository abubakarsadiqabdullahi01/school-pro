"use client"

import Link from "next/link"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Button } from "@/components/ui/button"
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

const columns: DataTableColumn[] = [
  { label: "Student" },
  { label: "Class" },
  { label: "Total Fees", align: "right" },
  { label: "Paid", align: "right" },
  { label: "Adjustments", align: "right" },
  { label: "Balance", align: "right" },
  { label: "Last Payment" },
  { label: "Parent Contact" },
  { label: "Actions", printHidden: true },
]

export function DebtorsTable({ basePath, rows }: { basePath: string; rows: DebtorsTableRow[] }) {
  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "-")

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.studentId,
    search: [row.studentName, row.admissionNo, row.className ?? "", row.parentContact ?? ""].join(" "),
    cells: [
      <>
        <div className="font-medium">{row.studentName}</div>
        <div className="text-muted-foreground">{row.admissionNo}</div>
      </>,
      row.className ?? "-",
      formatNaira(row.totalFees),
      formatNaira(row.totalPaid),
      // Discounts and exemptions are one column on screen: the debtor chasing a balance
      // cares that something was taken off, not which of the two it was.
      formatNaira(Number(row.discounts) + Number(row.exemptions)),
      <span className="font-semibold">{formatNaira(row.balance)}</span>,
      formatDate(row.lastPaymentDate),
      row.parentContact ?? "-",
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}/students/${row.studentId}/statement`}>Statement</Link>
        </Button>
        <Button size="sm" asChild>
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
      searchPlaceholder="Search student, admission number, class or contact"
      emptyMessage="No debtors for this filter."
      noMatchMessage="No debtors match the current search."
    />
  )
}
