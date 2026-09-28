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
import { PrintLandscape } from "@/components/reports/print-orientation"
import type { ExportTable } from "@/components/reports/report-export"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID", "REJECTED", "CANCELLED", "REVERSED"] as const

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
  const formatDate = (iso: string) => formatDocumentDate(iso)

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
    { label: "Date", width: "9%" },
    { label: "Voucher", width: "11%" },
    { label: "Payee", width: "22%" },
    { label: "Category", width: "12%" },
    { label: "Paid From", width: "12%" },
    { label: "Amount", align: "right", width: "11%" },
    { label: "Status", width: "10%" },
    { label: "Recorded By", width: "13%" },
    { label: "Actions", printHidden: true, width: "11rem" },
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
      <span key="date" className="whitespace-nowrap">
        {formatDate(row.expenseDate)}
      </span>,
      <span key="voucher" className="font-medium">
        {row.voucherNo}
      </span>,
      <div key="payee" className="min-w-0">
        <div className="font-medium">{row.payeeName}</div>
        <div className="text-muted-foreground">{row.description}</div>
      </div>,
      <span key="category">{row.categoryName}</span>,
      <span key="account">{row.accountName}</span>,
      <span key="amount" className="font-semibold whitespace-nowrap tabular-nums">
        {formatNaira(row.amount)}
      </span>,
      <span key="status">
        <span className="print:hidden">
          <ExpenseStatusBadge status={row.status} />
        </span>
        <span className="hidden print:block">{expenseStatusLabel(row.status)}</span>
      </span>,
      <span key="recorded">{row.recordedByName}</span>,
      <div key="actions" className="flex gap-2">
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
    <div className="space-y-6" data-print-document data-print-report>
      <PrintLandscape />
      <BrandedPrintHeader title="Expenditure Transactions" />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <InfoGuide guideKey="expenditure.transactions" />
          </div>
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

      <div className="grid gap-4 print:gap-2 sm:grid-cols-3">
        <Total label="Paid" value={totals.paid} />
        <Total label="Committed (approved + paid)" value={totals.committed} />
        <Total label="Still awaiting approval" value={totals.pending} />
      </div>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>Transaction List</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "record" : "records"}
            {rows.length === 2000 ? " (showing the most recent 2000 — narrow the filters to see the rest)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">
            {rows.length} {rows.length === 1 ? "record" : "records"}
          </p>
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
    <Card className="print:gap-0 print:py-2">
      <CardHeader className="pb-2 print:pb-0">
        <CardTitle className="text-sm print:text-[8pt]">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold tabular-nums print:text-[11pt]">
        {formatNaira(value, { kobo: false })}
      </CardContent>
    </Card>
  )
}
