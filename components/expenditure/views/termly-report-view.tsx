import { getExpenditureSetupData, getTermlyExpenditureReport } from "@/app/actions/expenditure"
import { PeriodFilter } from "@/components/reports/period-filter"
import { ReportExport, type ExportTable } from "@/components/reports/report-export"
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Termly Expenditure</h1>
          <p className="text-muted-foreground">What was spent in one term, and on what.</p>
        </div>
        <ReportExport title={`Termly Expenditure ${scope}`} subtitle={scope} table={exportTable} />
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
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Paid</th>
                  <th className="py-2 pr-4 font-medium">Count</th>
                  <th className="py-2 pr-4 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{row.name}</td>
                    <td className="py-3 pr-4">{formatNaira(row.amount)}</td>
                    <td className="py-3 pr-4">{row.count}</td>
                    <td className="py-3 pr-4">
                      {row.budgetLimit ? (
                        row.overBy ? (
                          <span className="text-destructive">Over by {formatNaira(row.overBy)}</span>
                        ) : (
                          <span className="text-muted-foreground">Within {formatNaira(row.budgetLimit)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.byCategory.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing paid out in this term.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Account</CardTitle>
            <CardDescription>Which cash source or account the money left from.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Account</th>
                  <th className="py-2 pr-4 font-medium">Paid</th>
                  <th className="py-2 pr-4 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.byAccount.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{row.name}</td>
                    <td className="py-3 pr-4">{formatNaira(row.amount)}</td>
                    <td className="py-3 pr-4">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.byAccount.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing paid out in this term.</p>
            )}
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
