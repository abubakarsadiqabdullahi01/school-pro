import { getFinanceSetupData, getReceiptRegister } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { ReceiptFilterBar } from "@/components/finance/views/receipt-filter-bar"
import { ReceiptsRegisterTable } from "@/components/finance/views/receipts-register-table"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  countActiveFilters,
  describeReceiptFilters,
  parseReceiptFilters,
  reconcilePeriod,
} from "@/lib/finance/receipt-filters"
import { paymentMethodLabel } from "@/lib/finance/payment-method"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * Every receipt the school has issued.
 *
 * The register exists so a receipt can be found by its number, by the student, or by the
 * bank reference — previously the only route to one was through the payment that created it,
 * which is no use when a parent turns up holding a printed slip.
 */
export async function ReceiptsView({
  basePath,
  searchParams,
}: {
  basePath: string
  /** The query string, straight from the page. Everything in it is checked before use. */
  searchParams: Record<string, string | string[] | undefined>
}) {
  const registerPath = `${basePath}/receipts`

  // Setup is read first because it settles the filters: a term id from a bookmark may belong
  // to a school year this school no longer has, and the query should not be built on it.
  const setup = await getFinanceSetupData()
  const sessions = setup.success ? setup.data.sessions : []
  const terms = setup.success ? setup.data.terms : []
  const filters = reconcilePeriod(parseReceiptFilters(searchParams), terms)

  const register = await getReceiptRegister(filters)
  if (!register.success) {
    return <p className="text-destructive">{register.error}</p>
  }

  const { rows, totalCount, totalAmount, completedAmount, capped, cashiers } = register.data
  const scope = describeReceiptFilters(filters, { sessions, terms, cashiers })
  const unconfirmed = sumAmounts([totalAmount]).minus(completedAmount)

  const exportTable: ExportTable = {
    columns: ["Date", "Receipt No", "Student", "Admission No", "Class", "Method", "Status", "Amount", "Received By"],
    rows: rows.map((row) => [
      formatDocumentDate(row.paymentDate),
      row.receiptNo,
      row.studentName,
      row.admissionNo,
      row.className ?? "-",
      paymentMethodLabel(row.method),
      row.status,
      formatNairaPlain(row.amount),
      row.receivedByName ?? "-",
    ]),
    csvRows: rows.map((row) => [
      row.paymentDate.slice(0, 10),
      row.receiptNo,
      row.studentName,
      row.admissionNo,
      row.className ?? "",
      row.method,
      row.status,
      toCsvAmount(row.amount),
      row.receivedByName ?? "",
    ]),
  }

  return (
    // `data-print-landscape` is deliberately absent. The named `@page finance-landscape`
    // it switches on is barely supported: the browser ignored the rotation and printed
    // portrait anyway, while the named page context still forced a break — which is the
    // blank first sheet. The columns below are sized to fit portrait instead.
    <div className="space-y-6" data-print-document data-print-report>
      <BrandedPrintHeader title="Receipt Register" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
            <InfoGuide guideKey="finance.receipts" />
          </div>
          <p className="text-muted-foreground">
            Every receipt issued by the school. Narrow by session, term, method, status, cashier or date, or
            search by receipt number, student, admission number or bank reference.
          </p>
        </div>
        <BrandedReportExport
          title={`Receipts · ${scope}`}
          subtitle={scope}
          table={exportTable}
          orientation="landscape"
        />
      </div>

      <ReceiptFilterBar
        basePath={registerPath}
        filters={filters}
        sessions={sessions}
        terms={terms}
        cashiers={cashiers}
      />

      <Card>
        <CardHeader>
          <CardTitle>Receipt Register</CardTitle>
          {/* Counted and summed by the database over everything that matches, rather than
              added up from the rows below: those stop at 500, and a total that silently
              means "the most recent 500" is a figure someone balances a cash book against. */}
          <CardDescription>
            {totalCount} {totalCount === 1 ? "receipt" : "receipts"} · {formatNaira(totalAmount)}
            {unconfirmed.isZero()
              ? " received"
              : `, of which ${formatNaira(completedAmount)} is confirmed and ${formatNaira(unconfirmed)} is awaiting confirmation`}
            {capped ? " · showing the most recent 500 — narrow the filters to see the rest" : ""}
          </CardDescription>
          <p className="hidden text-sm text-muted-foreground print:block">{scope}</p>
        </CardHeader>
        <CardContent>
          {/* The table says the empty case once. Which sentence it says is the view's to
              decide, because only the view knows whether anything was filtered out. */}
          <ReceiptsRegisterTable
            basePath={basePath}
            rows={rows}
            emptyMessage={
              countActiveFilters(filters) > 0
                ? "No receipt matches these filters. Remove one of the chips above, or clear them all."
                : "No receipts have been issued yet."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
