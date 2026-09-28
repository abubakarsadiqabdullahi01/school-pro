import Link from "next/link"

import { getPaymentAccounts } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { PaymentAccountFilterBar } from "@/components/expenditure/payment-account-filter-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PrintLandscape } from "@/components/reports/print-orientation"
import type { ExportTable } from "@/components/reports/report-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import {
  countPaymentAccountFilters,
  describePaymentAccountFilters,
  parsePaymentAccountFilters,
  paymentAccountTypeLabel,
} from "@/lib/expenditure/payment-account-filters"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"

// Seven columns totalling 100%, so the chart fills the sheet instead of stopping short of
// the right margin. The sheet is landscape (see `PrintLandscape` below), which is what gives
// the four money columns room to sit on one line each.
const columns: DataTableColumn[] = [
  { label: "Account", width: "24%" },
  { label: "Type", width: "12%" },
  { label: "Opening", align: "right", width: "13%" },
  { label: "Paid out", align: "right", width: "13%" },
  { label: "Balance", align: "right", width: "14%" },
  { label: "Vouchers", align: "right", width: "10%" },
  { label: "Status", width: "14%" },
]

/**
 * The payment chart — where money leaves from, and what each account has left.
 *
 * This is the list and nothing else. Adding an account and changing one are their own
 * screens, because a create form stacked above the table read as one page doing two jobs and
 * pushed the figures that matter below the fold.
 *
 * Balance is the figure the screen exists for, so it is also the thing you can filter on: an
 * overdrawn account is the one somebody is looking for, and it is computed on read rather
 * than stored, so a cancelled voucher corrects it immediately.
 */
export async function PaymentAccountsView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/accounts`
  const filters = parsePaymentAccountFilters(searchParams)

  const accounts = await getPaymentAccounts(filters)
  if (!accounts.success) {
    return <p className="text-destructive">{accounts.error}</p>
  }

  const { rows, totalCount } = accounts.data
  const filtered = countPaymentAccountFilters(filters) > 0
  const scope = describePaymentAccountFilters(filters)

  const openCount = rows.filter((row) => row.isActive).length
  const overdrawn = rows.filter((row) => Number(row.balance) < 0)
  const balance = sumAmounts(rows.map((row) => row.balance))
  const paidOut = sumAmounts(rows.map((row) => row.paidOut))

  const exportTable: ExportTable = {
    columns: ["Account", "Type", "Bank", "Number", "Opening", "Paid Out", "Balance", "Vouchers", "Status"],
    rows: rows.map((row) => [
      row.name,
      paymentAccountTypeLabel(row.type),
      row.bankName ?? "-",
      row.accountNumber ?? "-",
      formatNairaPlain(row.openingBalance),
      formatNairaPlain(row.paidOut),
      formatNairaPlain(row.balance),
      String(row.expenseCount),
      row.isActive ? "Open" : "Closed",
    ]),
    csvRows: rows.map((row) => [
      row.name,
      paymentAccountTypeLabel(row.type),
      row.bankName ?? "",
      row.accountNumber ?? "",
      toCsvAmount(row.openingBalance),
      toCsvAmount(row.paidOut),
      toCsvAmount(row.balance),
      String(row.expenseCount),
      row.isActive ? "Open" : "Closed",
    ]),
  }

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: `${listPath}/${row.id}`,
    search: [row.name, row.bankName ?? "", row.accountNumber ?? "", row.type].join(" "),
    // Keyed because this array is built on the server and crosses into the client payload,
    // where React checks the elements of a list for keys.
    cells: [
      <div key="account" className="min-w-0">
        <div className="font-medium">{row.name}</div>
        {(row.bankName || row.accountNumber) && (
          <p className="truncate text-xs text-muted-foreground">
            {[row.bankName, row.accountNumber].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>,
      <span key="type">
        {paymentAccountTypeLabel(row.type)}
      </span>,
      <span key="opening" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.openingBalance)}
      </span>,
      <span key="paid" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.paidOut)}
      </span>,
      <span
        key="balance"
        className={`whitespace-nowrap font-semibold tabular-nums ${
          Number(row.balance) < 0 ? "text-destructive" : ""
        }`}
      >
        {formatNaira(row.balance)}
      </span>,
      <div key="vouchers" className="whitespace-nowrap">
        <span className="tabular-nums">{row.expenseCount}</span>
        <p className="text-xs text-muted-foreground">
          {row.unpaidExpenseCount > 0 ? `${row.unpaidExpenseCount} to pay` : `${row.paidCount} paid`}
        </p>
      </div>,
      <div key="status" className="flex flex-col gap-1">
        <Badge variant={row.isActive ? "default" : "secondary"} className="w-fit print:hidden">
          {row.isActive ? "Open" : "Closed"}
        </Badge>
        <span className="hidden print:block">{row.isActive ? "Open" : "Closed"}</span>
        <span className="text-xs text-muted-foreground">
          {row.lastPaidAt ? `Last paid ${formatDocumentDate(row.lastPaidAt)}` : "Never used"}
        </span>
      </div>,
    ],
  }))

  const footerCells = [
    <span key="label" className="font-semibold">
      {filtered ? "FILTERED TOTAL" : "TOTAL"}
    </span>,
    <span key="type" />,
    <span key="opening" className="whitespace-nowrap tabular-nums">
      {formatNaira(sumAmounts(rows.map((row) => row.openingBalance)))}
    </span>,
    <span key="paid" className="whitespace-nowrap tabular-nums">
      {formatNaira(paidOut)}
    </span>,
    <span
      key="balance"
      className={`whitespace-nowrap tabular-nums ${Number(balance) < 0 ? "text-destructive" : ""}`}
    >
      {formatNaira(balance)}
    </span>,
    <span key="vouchers" className="tabular-nums">
      {rows.reduce((total, row) => total + row.expenseCount, 0)}
    </span>,
    <span key="status" />,
  ]

  return (
    // Landscape: seven columns, two of them dates and four of them naira, is a wide table on
    // a portrait sheet. `PrintLandscape` is used rather than `data-print-landscape` because
    // the named page the latter switches on rotates nothing in practice.
    <div className="space-y-6" data-print-document data-print-report>
      <PrintLandscape />
      <BrandedPrintHeader title="Payment Chart" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Payment Chart</h1>
            <InfoGuide guideKey="expenditure.accounts" />
          </div>
          <p className="text-muted-foreground">
            Where money is paid from, and what each account has left. Open one to rename it, correct its
            details, close it or see what has left it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandedReportExport
            title={`Payment Chart · ${scope}`}
            subtitle={scope}
            table={exportTable}
            orientation="landscape"
          />
          <Button asChild>
            <Link href={`${listPath}/new`}>New payment account</Link>
          </Button>
        </div>
      </div>

      <PaymentAccountFilterBar basePath={listPath} filters={filters} />

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Accounts</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{rows.length}</p>
          <p className="text-xs text-muted-foreground">
            {filtered ? `of ${totalCount} in the chart` : `${openCount} open`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Balance held</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              Number(balance) < 0 ? "text-destructive" : ""
            }`}
          >
            {formatNaira(balance, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">opening figures less what has gone out</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Paid out</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(paidOut, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">across every voucher marked paid</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Overdrawn</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              overdrawn.length > 0 ? "text-destructive" : ""
            }`}
          >
            {overdrawn.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {overdrawn.length === 0
              ? "every account is in funds"
              : `${formatNaira(
                  sumAmounts(overdrawn.map((row) => row.balance)),
                  { kobo: false },
                )} below the opening figures`}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>Payment Chart</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "account" : "accounts"}
            {filtered ? ` of ${totalCount}` : ""} · balance is the opening figure less everything paid out
            of the account, computed on read, so a cancelled payment corrects it immediately.
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="accounts"
            searchable={false}
            footer={footerCells}
            emptyMessage={
              filtered
                ? "No account matches these filters. Remove one of the chips above, or clear them all."
                : "No payment accounts yet. Add the cash office or the main bank account to start recording spending."
            }
          />
          {rows.length === 0 && !filtered && (
            <div className="pb-4 text-center">
              <Button asChild size="sm">
                <Link href={`${listPath}/new`}>New payment account</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
