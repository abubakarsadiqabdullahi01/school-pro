import Link from "next/link"

import {
  getExpenditureSetupData,
  getExpenseTransactions,
  type ExpenseFilters,
} from "@/app/actions/expenditure"
import { ExpenditureFilter, type ExpenditureFilterValues } from "@/components/expenditure/expenditure-filter"
import { ExpenseStatusBadge, expenseStatusLabel } from "@/components/expenditure/expense-status-badge"
import { ReportExport, type ExportTable } from "@/components/reports/report-export"
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Every expenditure record, filtered however the question needs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReportExport title="Expenditure Transactions" subtitle="Filtered transaction list" table={exportTable} />
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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Voucher</th>
                <th className="py-2 pr-4 font-medium">Payee</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Paid From</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Recorded By</th>
                <th className="py-2 pr-4 font-medium print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDate(row.expenseDate)}</td>
                  <td className="py-3 pr-4 font-medium">{row.voucherNo}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.payeeName}</div>
                    <div className="text-muted-foreground">{row.description}</div>
                  </td>
                  <td className="py-3 pr-4">{row.categoryName}</td>
                  <td className="py-3 pr-4">{row.accountName}</td>
                  <td className="py-3 pr-4 font-semibold whitespace-nowrap">{formatNaira(row.amount)}</td>
                  <td className="py-3 pr-4"><ExpenseStatusBadge status={row.status} /></td>
                  <td className="py-3 pr-4">{row.recordedByName}</td>
                  <td className="py-3 pr-4 print:hidden">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`${basePath}/transactions/${row.id}`}>View</Link>
                      </Button>
                      {row.status === "PAID" && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`${basePath}/vouchers/${row.id}`}>Voucher</Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No expenditure matches these filters.</p>
          )}
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
