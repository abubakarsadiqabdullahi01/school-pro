import { getExpenditureSetupData, getSessionExpenditureReport } from "@/app/actions/expenditure"
import { PeriodFilter } from "@/components/reports/period-filter"
import { ReportExport, type ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function SessionExpenditureReportView({
  basePath,
  sessionId,
}: {
  basePath: string
  sessionId?: string
}) {
  const [report, setup] = await Promise.all([getSessionExpenditureReport({ sessionId }), getExpenditureSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const { data } = report
  const scope = data.sessionName ?? "All sessions"
  const totals = data.sessionTotals

  // The session total goes in as a final row: this report is read as a whole, and the
  // bottom line is what the budget summary is set against.
  const exportTable: ExportTable = {
    columns: ["Term", "Paid", "Committed", "Awaiting Approval", "Transactions"],
    rows: [
      ...data.terms.map((row) => [
        row.termName,
        formatNairaPlain(row.paid),
        formatNairaPlain(row.committed),
        formatNairaPlain(row.pending),
        String(row.count),
      ]),
      [
        "SESSION TOTAL",
        formatNairaPlain(totals.paid),
        formatNairaPlain(totals.committed),
        formatNairaPlain(totals.pending),
        String(totals.count),
      ],
    ],
    csvRows: [
      ...data.terms.map((row) => [
        row.termName,
        toCsvAmount(row.paid),
        toCsvAmount(row.committed),
        toCsvAmount(row.pending),
        String(row.count),
      ]),
      [
        "SESSION TOTAL",
        toCsvAmount(totals.paid),
        toCsvAmount(totals.committed),
        toCsvAmount(totals.pending),
        String(totals.count),
      ],
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Session Expenditure</h1>
          <p className="text-muted-foreground">Term by term across the whole session, with the category breakdown.</p>
        </div>
        <ReportExport title={`Session Expenditure ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <PeriodFilter
          basePath={`${basePath}/reports/session`}
          sessions={setup.data.sessions}
          selectedSessionId={sessionId}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Tile label="Paid this session" value={totals.paid} />
        <Tile label="Committed" value={totals.committed} />
        <Tile label="Awaiting approval" value={totals.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Term by Term</CardTitle>
          <CardDescription>{scope}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Term</th>
                <th className="py-2 pr-4 font-medium">Paid</th>
                <th className="py-2 pr-4 font-medium">Committed</th>
                <th className="py-2 pr-4 font-medium">Awaiting Approval</th>
                <th className="py-2 pr-4 font-medium">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {data.terms.map((row) => (
                <tr key={row.termId} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{row.termName}</td>
                  <td className="py-3 pr-4">{formatNaira(row.paid)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.committed)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.pending)}</td>
                  <td className="py-3 pr-4">{row.count}</td>
                </tr>
              ))}
              {data.terms.length > 0 && (
                <tr className="border-t-2 font-semibold">
                  <td className="py-3 pr-4">Session total</td>
                  <td className="py-3 pr-4">{formatNaira(totals.paid)}</td>
                  <td className="py-3 pr-4">{formatNaira(totals.committed)}</td>
                  <td className="py-3 pr-4">{formatNaira(totals.pending)}</td>
                  <td className="py-3 pr-4">{totals.count}</td>
                </tr>
              )}
            </tbody>
          </table>
          {data.terms.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No terms found for this session.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By Category" description="Across the whole session." rows={data.byCategory} />
        <BreakdownTable title="By Account" description="Which account each naira left from." rows={data.byAccount} />
      </div>
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

function BreakdownTable({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{ id: string; name: string; amount: string; count: number }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Paid</th>
              <th className="py-2 pr-4 font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{row.name}</td>
                <td className="py-3 pr-4">{formatNaira(row.amount)}</td>
                <td className="py-3 pr-4">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing paid out this session.</p>
        )}
      </CardContent>
    </Card>
  )
}
