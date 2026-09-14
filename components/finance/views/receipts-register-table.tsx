"use client"

import Link from "next/link"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Button } from "@/components/ui/button"
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

const columns: DataTableColumn[] = [
  { label: "Date" },
  { label: "Receipt No" },
  { label: "Student" },
  { label: "Class" },
  { label: "Method" },
  { label: "Amount", align: "right" },
  { label: "Received By" },
  { label: "Actions", printHidden: true },
]

export function ReceiptsRegisterTable({ basePath, rows }: { basePath: string; rows: ReceiptRegisterRow[] }) {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

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
    cells: [
      <span className="whitespace-nowrap">{formatDate(row.paymentDate)}</span>,
      <Link href={`${basePath}/receipts/${row.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
        {row.receiptNo}
      </Link>,
      <>
        <div className="font-medium">{row.studentName}</div>
        <div className="text-muted-foreground">{row.admissionNo}</div>
      </>,
      row.className ?? "-",
      row.method.replace("_", " "),
      <span className="font-semibold whitespace-nowrap">{formatNaira(row.amount)}</span>,
      row.receivedByName ?? "-",
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}/receipts/${row.id}`}>Receipt</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
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
      emptyMessage="No receipts have been issued yet."
      noMatchMessage="No receipts match the current search."
    />
  )
}
