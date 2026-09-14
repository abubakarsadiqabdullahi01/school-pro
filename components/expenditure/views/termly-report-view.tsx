import { getExpenditureSetupData, getTermlyExpenditureReport } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PeriodFilter } from "@/components/reports/period-filter"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function TermlyExpenditureReportView({
  basePath,
  termId,
}: {
  basePath: string
  termId?: string
}) {
  const [report, setup] = await Promise.all([getTermlyExpenditureReport({ termId }), getExpenditureSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const { data } = report
  const scope = [data.sessionName, data.termName].filter(Boolean).join(" · ") || "All terms"

  const exportTable: ExportTable = {
    columns: ["Category", "Paid", "Transactions", "Budget Limit", "Over By"],
    rows: data.byCategory.map((row) => [
      row.name,
      formatNairaPlain(row.amount),
      String(row.count),
      row.budgetLimit ? formatNairaPlain(row.budgetLimit) : "—",
      row.overBy ? formatNairaPlain(row.overBy) : "—",
    ]),
    csvRows: data.byCategory.map((row) => [
      row.name,
      toCsvAmount(row.amount),
      String(row.count),
      row.budgetLimit ? toCsvAmount(row.budgetLimit) : "",
      row.overBy ? toCsvAmount(row.overBy) : "",
    ]),
  }

  const categoryColumns: DataTableColumn[] = [
    { label: "Category" },
    { label: "Paid", align: "right" },
    { label: "Count", align: "right" },
    { label: "Budget" },
  ]

  const categoryRows: DataTableRow[] = data.byCategory.map((row) => ({
    id: row.id,
    search: row.name,
    cells: [
      <span className="font-medium">{row.name}</span>,
      formatNaira(row.amount),
      row.count,
      row.budgetLimit ? (
        row.overBy ? (
          <span className="text-destructive">Over by {formatNaira(row.overBy)}</span>
        ) : (
          <span className="text-muted-foreground">Within {formatNaira(row.budgetLimit)}</span>
        )
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    ],
  }))

  const accountColumns: DataTableColumn[] = [
    { label: "Account" },
    { label: "Paid", align: "right" },
    { label: "Count", align: "right" },
  ]

  const accountRows: DataTableRow[] = data.byAccount.map((row) => ({
    id: row.id,
    search: row.name,
    cells: [<span className="font-medium">{row.name}</span>, formatNaira(row.amount), row.count],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Termly Expenditure" reference={scope} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Termly Expenditure</h1>
          <p className="text-muted-foreground">What was spent in one term, and on what.</p>
        </div>
        <BrandedReportExport title={`Termly Expenditure ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilter basePath={`${basePath}/reports/termly`} terms={setup.data.terms} selectedTermId={termId} />
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Tile label="Paid" value={data.paid} />
        <Tile label="Committed" value={data.committed} />
        <Tile label="Awaiting approval" value={data.pending} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Transactions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{data.transactionCount}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
            <CardDescription>Paid expenditure, largest first. A budget limit is a warning, not a block.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={categoryColumns}
              rows={categoryRows}
              pageSize={8}
              unit="categories"
              searchPlaceholder="Search by category"
              emptyMessage="Nothing paid out in this term."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Account</CardTitle>
            <CardDescription>Which cash source or account the money left from.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={accountColumns}
              rows={accountRows}
              pageSize={8}
              unit="accounts"
              searchPlaceholder="Search by account"
              emptyMessage="Nothing paid out in this term."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Largest Payments</CardTitle>
          <CardDescription>The ten biggest paid vouchers in this term.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Voucher</th>
                <th className="py-2 pr-4 font-medium">Payee</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.topTransactions.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">{new Date(row.expenseDate).toLocaleDateString()}</td>
                  <td className="py-3 pr-4 font-medium">{row.voucherNo}</td>
                  <td className="py-3 pr-4">{row.payeeName}</td>
                  <td className="py-3 pr-4">{row.categoryName}</td>
                  <td className="py-3 pr-4 font-semibold">{formatNaira(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.topTransactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments in this term.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{formatNaira(value, { kobo: false })}</CardContent>
    </Card>
  )
}
