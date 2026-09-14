import { getBudgetSummary, getExpenditureSetupData } from "@/app/actions/expenditure"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { PeriodFilter } from "@/components/reports/period-filter"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

/**
 * Where the two modules meet.
 *
 * Three balances, because they answer three different questions, and a school that reads
 * only one of them will get a nasty surprise:
 *
 *  - **Actual** is cash reality: collected, less paid out.
 *  - **Committed** subtracts approved-but-unpaid expenditure too. This is the one to check
 *    before promising more money, because that spending is already spoken for.
 *  - **Expected** assumes every debtor eventually pays. It is what a budget is planned
 *    against, and the most optimistic of the three.
 */
export async function BudgetSummaryView({ basePath, sessionId }: { basePath: string; sessionId?: string }) {
  const [summary, setup] = await Promise.all([getBudgetSummary({ sessionId }), getExpenditureSetupData()])

  if (!summary.success) {
    return <p className="text-destructive">{summary.error}</p>
  }

  const { data } = summary
  const scope = data.sessionName ?? "All sessions"

  const lines: Array<{ label: string; value: string; emphasis?: boolean }> = [
    { label: "Scheduled school fees", value: data.income.scheduledFees },
    { label: "Less discounts", value: data.income.discounts },
    { label: "Less exemptions", value: data.income.exemptions },
    { label: "Net expected income", value: data.income.netExpected, emphasis: true },
    { label: "Fees actually collected", value: data.income.paid, emphasis: true },
    { label: "Outstanding debt", value: data.income.outstanding },
    { label: "Expenditure paid", value: data.expenditure.paid, emphasis: true },
    { label: "Approved, not yet paid", value: data.expenditure.approvedUnpaid },
    { label: "Awaiting approval", value: data.expenditure.pending },
    { label: "Balance forward (actual)", value: data.actualBalance, emphasis: true },
    { label: "Balance after commitments", value: data.committedBalance, emphasis: true },
    { label: "Balance if all debt is paid", value: data.expectedBalance, emphasis: true },
  ]

  const exportTable: ExportTable = {
    columns: ["Line", "Amount"],
    rows: lines.map((line) => [line.label, formatNairaPlain(line.value)]),
    csvRows: lines.map((line) => [line.label, toCsvAmount(line.value)]),
  }

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Budget Summary" reference={scope} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Budget Summary</h1>
          <p className="text-muted-foreground">Income from fees, less what the school has spent.</p>
        </div>
        <BrandedReportExport title={`Budget Summary ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilter
          basePath={`${basePath}/budget-summary`}
          sessions={setup.data.sessions}
          selectedSessionId={sessionId}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <BalanceTile
          label="Balance forward"
          hint="Collected, less paid out"
          value={data.actualBalance}
        />
        <BalanceTile
          label="After commitments"
          hint="Also subtracts approved but unpaid"
          value={data.committedBalance}
        />
        <BalanceTile
          label="If all debt is paid"
          hint="Net expected income, less paid out"
          value={data.expectedBalance}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income</CardTitle>
            <CardDescription>From the finance accumulated fund for {scope}.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Scheduled school fees" value={data.income.scheduledFees} />
              <Line label="Discounts" value={data.income.discounts} negative />
              <Line label="Exemptions" value={data.income.exemptions} negative />
              <Line label="Net expected income" value={data.income.netExpected} strong />
              <Line label="Fees actually collected" value={data.income.paid} strong />
              <Line label="Outstanding debt" value={data.income.outstanding} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenditure</CardTitle>
            <CardDescription>Only paid expenditure leaves the balance; the rest is committed.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Paid" value={data.expenditure.paid} strong />
              <Line label="Approved, not yet paid" value={data.expenditure.approvedUnpaid} />
              <Line label="Awaiting approval" value={data.expenditure.pending} />
              <Line label="Committed (paid + approved)" value={data.expenditure.committed} strong />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the balance is reached</CardTitle>
          <CardDescription>
            Balance forward = fees collected − expenditure paid. Cancelled and rejected vouchers count for nothing.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line) => (
                <tr key={line.label} className={`border-b last:border-0 ${line.emphasis ? "font-semibold" : ""}`}>
                  <td className="py-3 pr-4">{line.label}</td>
                  <td
                    className={`py-3 pr-4 text-right ${Number(line.value) < 0 ? "text-destructive" : ""}`}
                  >
                    {formatNaira(line.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceTile({ label, hint, value }: { label: string; hint: string; value: string }) {
  const negative = Number(value) < 0
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className={`text-2xl font-bold ${negative ? "text-destructive" : ""}`}>
        {formatNaira(value, { kobo: false })}
      </CardContent>
    </Card>
  )
}

function Line({
  label,
  value,
  strong,
  negative,
}: {
  label: string
  value: string
  strong?: boolean
  negative?: boolean
}) {
  return (
    <div className={`flex justify-between gap-4 border-b pb-2 last:border-0 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{negative ? "−" : ""}{formatNaira(value)}</dd>
    </div>
  )
}
