import Link from "next/link"

import {
  getExpenditureSetupData,
  getExpenseTransactions,
  type ExpenseFilters,
} from "@/app/actions/expenditure"
import { ExpenditureFilter, type ExpenditureFilterValues } from "@/components/expenditure/expenditure-filter"
import { ExpenseStatusBadge, expenseStatusLabel } from "@/components/expenditure/expense-status-badge"
import { BackButton } from "@/components/back-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "REJECTED", "CANCELLED"] as const

/** Only a real status reaches the query; a hand-edited URL is ignored rather than trusted. */
function statusOf(raw?: string): ExpenseFilters["status"] {
  return STATUSES.includes(raw as (typeof STATUSES)[number]) ? (raw as ExpenseFilters["status"]) : null
}

/** `?minAmount=abc` must not become NaN inside a Prisma comparison. */
function amountOf(raw?: string): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export async function ExpenditureTransactionsView({
  basePath,
  filters,
}: {
  basePath: string
  filters: ExpenditureFilterValues
}) {
  const applied: ExpenseFilters = {
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
    categoryId: filters.categoryId ?? null,
    accountId: filters.accountId ?? null,
    status: statusOf(filters.status),
    payee: filters.payee?.trim() || null,
    from: filters.from || null,
    to: filters.to || null,
    minAmount: amountOf(filters.minAmount),
    maxAmount: amountOf(filters.maxAmount),
  }

  const [transactions, setup] = await Promise.all([getExpenseTransactions(applied), getExpenditureSetupData()])

  if (!transactions.success) {
    return <p className="text-destructive">{transactions.error}</p>
  }

  const { rows, totals } = transactions.data
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

  const exportTable: ExportTable = {
    columns: [
      "Date",
      "Voucher",
      "Payee",
      "Category",
      "Description",
      "Paid From",
      "Method",
      "Reference",
      "Amount",
      "Status",
      "Recorded By",
      "Approved By",
      "Paid By",
    ],
    rows: rows.map((row) => [
      formatDate(row.expenseDate),
      row.voucherNo,
      row.payeeName,
      row.categoryName,
      row.description,
      row.accountName,
      row.paymentMethod.replace("_", " "),
      row.referenceNo ?? "-",
      formatNairaPlain(row.amount),
      expenseStatusLabel(row.status),
      row.recordedByName,
      row.approvedByName ?? "-",
      row.paidByName ?? "-",
    ]),
    csvRows: rows.map((row) => [
      row.expenseDate.slice(0, 10),
      row.voucherNo,
      row.payeeName,
      row.categoryName,
      row.description,
      row.accountName,
      row.paymentMethod,
      row.referenceNo ?? "",
      toCsvAmount(row.amount),
      row.status,
      row.recordedByName,
      row.approvedByName ?? "",
      row.paidByName ?? "",
    ]),
  }

  const columns: DataTableColumn[] = [
    { label: "Date" },
    { label: "Voucher" },
    { label: "Payee" },
    { label: "Category" },
    { label: "Paid From" },
    { label: "Amount", align: "right" },
    { label: "Status" },
    { label: "Recorded By" },
    { label: "Actions", printHidden: true },
  ]

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    search: [
      row.voucherNo,
      row.payeeName,
      row.description,
      row.categoryName,
      row.accountName,
      expenseStatusLabel(row.status),
      row.recordedByName,
      row.referenceNo ?? "",
    ].join(" "),
    cells: [
      <span className="whitespace-nowrap">{formatDate(row.expenseDate)}</span>,
      <span className="font-medium">{row.voucherNo}</span>,
      <>
        <div className="font-medium">{row.payeeName}</div>
        <div className="text-muted-foreground">{row.description}</div>
      </>,
      row.categoryName,
      row.accountName,
      <span className="font-semibold whitespace-nowrap">{formatNaira(row.amount)}</span>,
      <ExpenseStatusBadge status={row.status} />,
      row.recordedByName,
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}/transactions/${row.id}`}>View</Link>
        </Button>
        {row.status === "PAID" && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${basePath}/vouchers/${row.id}`}>Voucher</Link>
          </Button>
        )}
      </div>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Expenditure Transactions" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Every expenditure record, filtered however the question needs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandedReportExport title="Expenditure Transactions" subtitle="Filtered transaction list" table={exportTable} />
          <Button size="sm" asChild>
            <Link href={`${basePath}/new`}>Record Expenditure</Link>
          </Button>
        </div>
      </div>

      {setup.success && (
        <ExpenditureFilter
          basePath={`${basePath}/transactions`}
          sessions={setup.data.sessions}
          terms={setup.data.terms}
          categories={setup.data.categories}
          accounts={setup.data.accounts}
          values={filters}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Total label="Paid" value={totals.paid} />
        <Total label="Committed (approved + paid)" value={totals.committed} />
        <Total label="Still awaiting approval" value={totals.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction List</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "record" : "records"}
            {rows.length === 2000 ? " (showing the most recent 2000 — narrow the filters to see the rest)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="records"
            searchPlaceholder="Search voucher, payee, category or description"
            emptyMessage="No expenditure matches these filters."
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{formatNaira(value, { kobo: false })}</CardContent>
    </Card>
  )
}
