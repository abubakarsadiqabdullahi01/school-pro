import { getAccumulatedFundReport, getFinanceSetupData } from "@/app/actions/finance"
import { FinanceExport, type ExportTable } from "@/components/finance/finance-export"
import { FinanceReportFilter } from "@/components/finance/finance-report-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function AccumulatedFundView({ basePath, sessionId }: { basePath: string; sessionId?: string }) {
  const [report, setup] = await Promise.all([getAccumulatedFundReport({ sessionId }), getFinanceSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const sessionName = setup.success
    ? setup.data.sessions.find((session) => session.id === sessionId)?.name
    : undefined

  // The session totals go in as a final row. This report is read as a whole — the point of
  // it is the bottom line that expenditure will later be set against.
  const totals = report.data.sessionTotals
  const exportTable: ExportTable = {
    columns: ["Term", "Session", "Scheduled", "Discounts", "Exemptions", "Net Expected", "Paid", "Outstanding"],
    rows: [
      ...report.data.terms.map((row) => [
        row.termName,
        row.sessionName,
        formatNairaPlain(row.scheduledFees),
        formatNairaPlain(row.discounts),
        formatNairaPlain(row.exemptions),
        formatNairaPlain(row.netExpected),
        formatNairaPlain(row.paid),
        formatNairaPlain(row.outstanding),
      ]),
      [
        "SESSION TOTAL",
        sessionName ?? "",
        formatNairaPlain(totals.scheduledFees),
        formatNairaPlain(totals.discounts),
        formatNairaPlain(totals.exemptions),
        formatNairaPlain(totals.netExpected),
        formatNairaPlain(totals.paid),
        formatNairaPlain(totals.outstanding),
      ],
    ],
    csvRows: [
      ...report.data.terms.map((row) => [
        row.termName,
        row.sessionName,
        toCsvAmount(row.scheduledFees),
        toCsvAmount(row.discounts),
        toCsvAmount(row.exemptions),
        toCsvAmount(row.netExpected),
        toCsvAmount(row.paid),
        toCsvAmount(row.outstanding),
      ]),
      [
        "SESSION TOTAL",
        sessionName ?? "",
        toCsvAmount(totals.scheduledFees),
        toCsvAmount(totals.discounts),
        toCsvAmount(totals.exemptions),
        toCsvAmount(totals.netExpected),
        toCsvAmount(totals.paid),
        toCsvAmount(totals.outstanding),
      ],
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accumulated Fund</h1>
          <p className="text-muted-foreground">Term and session income totals before expenditure is introduced.</p>
        </div>
        <FinanceExport
          title={sessionName ? `Accumulated Fund ${sessionName}` : "Accumulated Fund"}
          subtitle={sessionName ? `Session: ${sessionName}` : "All sessions"}
          table={exportTable}
        />
      </div>
      {setup.success && (
        <FinanceReportFilter
          basePath={`${basePath}/accumulated-fund`}
          sessions={setup.data.sessions}
          selectedSessionId={sessionId}
        />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Expected</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.netExpected, { kobo: false })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Paid</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.paid, { kobo: false })}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatNaira(totals.outstanding, { kobo: false })}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Income Foundation</CardTitle>
          <CardDescription>This becomes the income side of the later budget and expenditure report.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Term</th>
                <th className="py-2 pr-4 font-medium">Scheduled</th>
                <th className="py-2 pr-4 font-medium">Discounts</th>
                <th className="py-2 pr-4 font-medium">Exemptions</th>
                <th className="py-2 pr-4 font-medium">Net Expected</th>
                <th className="py-2 pr-4 font-medium">Paid</th>
                <th className="py-2 pr-4 font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {report.data.terms.map((row) => (
                <tr key={row.termId} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.termName}</div>
                    <div className="text-muted-foreground">{row.sessionName}</div>
                  </td>
                  <td className="py-3 pr-4">{formatNaira(row.scheduledFees)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.discounts)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.exemptions)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.netExpected)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.paid)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.data.terms.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No charge data found.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
