import { getClassPaymentSummary, getFinanceSetupData } from "@/app/actions/finance"
import { FinanceExport, type ExportTable } from "@/components/finance/finance-export"
import { FinanceReportFilter } from "@/components/finance/finance-report-filter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

export async function ClassSummaryView({ basePath, termId }: { basePath: string; termId?: string }) {
  const [summary, setup] = await Promise.all([getClassPaymentSummary({ termId }), getFinanceSetupData()])

  if (!summary.success) {
    return <p className="text-destructive">{summary.error}</p>
  }

  const termName = setup.success ? setup.data.terms.find((term) => term.id === termId)?.name : undefined

  // The status counts are split into their own columns for export: "3 paid · 1 partial"
  // reads fine on screen but cannot be filtered or summed in a spreadsheet.
  const exportTable: ExportTable = {
    columns: ["Class", "Term", "Students", "Expected", "Paid", "Outstanding", "Fully Paid", "Partial", "Unpaid", "Collection %"],
    rows: summary.data.map((row) => [
      row.className,
      row.termName,
      String(row.students),
      formatNairaPlain(row.expected),
      formatNairaPlain(row.paid),
      formatNairaPlain(row.outstanding),
      String(row.paidCount),
      String(row.partialCount),
      String(row.unpaidCount),
      `${row.collectionRate}%`,
    ]),
    csvRows: summary.data.map((row) => [
      row.className,
      row.termName,
      String(row.students),
      toCsvAmount(row.expected),
      toCsvAmount(row.paid),
      toCsvAmount(row.outstanding),
      String(row.paidCount),
      String(row.partialCount),
      String(row.unpaidCount),
      String(row.collectionRate),
    ]),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Payment Summary</h1>
          <p className="text-muted-foreground">Expected, paid, outstanding, and collection percentage by class.</p>
        </div>
        <FinanceExport
          title={termName ? `Class Payment Summary ${termName}` : "Class Payment Summary"}
          subtitle={termName ? `Term: ${termName}` : "All terms"}
          table={exportTable}
        />
      </div>
      {setup.success && (
        <FinanceReportFilter basePath={`${basePath}/class-summary`} terms={setup.data.terms} selectedTermId={termId} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Class Summary</CardTitle>
          <CardDescription>Aggregated from fee schedules and student charges.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Class</th>
                <th className="py-2 pr-4 font-medium">Students</th>
                <th className="py-2 pr-4 font-medium">Expected</th>
                <th className="py-2 pr-4 font-medium">Paid</th>
                <th className="py-2 pr-4 font-medium">Outstanding</th>
                <th className="py-2 pr-4 font-medium">Status Count</th>
                <th className="py-2 pr-4 font-medium">Collection</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.map((row) => (
                <tr key={row.classTermId} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.className}</div>
                    <div className="text-muted-foreground">{row.termName}</div>
                  </td>
                  <td className="py-3 pr-4">{row.students}</td>
                  <td className="py-3 pr-4">{formatNaira(row.expected)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.paid)}</td>
                  <td className="py-3 pr-4">{formatNaira(row.outstanding)}</td>
                  <td className="py-3 pr-4">
                    {row.paidCount} paid · {row.partialCount} partial · {row.unpaidCount} unpaid
                  </td>
                  <td className="py-3 pr-4 font-medium">{row.collectionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.data.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No class charges found.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
