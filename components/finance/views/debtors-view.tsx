import { getDebtorsReport, getFinanceSetupData, type DebtorFilters } from "@/app/actions/finance"
import { DebtorsFilter, type DebtorsFilterValues } from "@/components/finance/debtors-filter"
import { DebtorsTable } from "@/components/finance/views/debtors-table"
import { BackButton } from "@/components/back-button"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNairaPlain, toCsvAmount } from "@/lib/money"

/** Only the two values the report understands; anything else in the URL is ignored. */
function paymentStatusOf(raw?: string): DebtorFilters["paymentStatus"] {
  return raw === "UNPAID" || raw === "PARTIAL" ? raw : null
}

function studentTypeOf(raw?: string): DebtorFilters["studentType"] {
  return raw === "NEW_STUDENTS" || raw === "RETURNING_STUDENTS" ? raw : null
}

/** A hand-edited `?minBalance=abc` must not become NaN in a Prisma comparison. */
function minBalanceOf(raw?: string): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export async function DebtorsView({ basePath, filters }: { basePath: string; filters: DebtorsFilterValues }) {
  const applied: DebtorFilters = {
    sessionId: filters.sessionId ?? null,
    termId: filters.termId ?? null,
    classTermId: filters.classTermId ?? null,
    minBalance: minBalanceOf(filters.minBalance),
    paymentStatus: paymentStatusOf(filters.paymentStatus),
    studentType: studentTypeOf(filters.studentType),
  }

  const [report, setup] = await Promise.all([getDebtorsReport(applied), getFinanceSetupData()])

  if (!report.success) {
    return <p className="text-destructive">{report.error}</p>
  }

  const termName = setup.success ? setup.data.terms.find((term) => term.id === filters.termId)?.name : undefined
  const sessionName = setup.success
    ? setup.data.sessions.find((session) => session.id === filters.sessionId)?.name
    : undefined
  const scope = [sessionName, termName].filter(Boolean).join(" · ") || "All sessions and terms"

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "-")

  // Money is formatted here so the export component stays free of Decimal helpers: the PDF
  // takes NGN strings its font can print, the CSV takes bare numbers a spreadsheet can sum.
  const exportTable: ExportTable = {
    columns: [
      "Student",
      "Admission No",
      "Class",
      "Total Fees",
      "Paid",
      "Adjustments",
      "Balance",
      "Last Payment",
      "Parent Contact",
    ],
    rows: report.data.map((row) => [
      row.studentName,
      row.admissionNo,
      row.className ?? "-",
      formatNairaPlain(row.totalFees),
      formatNairaPlain(row.totalPaid),
      formatNairaPlain(Number(row.discounts) + Number(row.exemptions)),
      formatNairaPlain(row.balance),
      formatDate(row.lastPaymentDate),
      row.parentContact ?? "-",
    ]),
    csvRows: report.data.map((row) => [
      row.studentName,
      row.admissionNo,
      row.className ?? "",
      toCsvAmount(row.totalFees),
      toCsvAmount(row.totalPaid),
      toCsvAmount(Number(row.discounts) + Number(row.exemptions)),
      toCsvAmount(row.balance),
      row.lastPaymentDate ? row.lastPaymentDate.slice(0, 10) : "",
      row.parentContact ?? "",
    ]),
  }

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Debtor Report" reference={scope} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Debtors</h1>
          <p className="text-muted-foreground">Students with unpaid or partially paid charges by class and term.</p>
        </div>
        <BrandedReportExport title={`Debtors ${scope}`} subtitle={scope} table={exportTable} />
      </div>

      {setup.success && (
        <DebtorsFilter
          basePath={`${basePath}/debtors`}
          sessions={setup.data.sessions}
          terms={setup.data.terms}
          classTerms={setup.data.classTerms}
          values={filters}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Debtor Report</CardTitle>
          <CardDescription>
            {report.data.length} {report.data.length === 1 ? "student" : "students"} owing · {scope}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DebtorsTable basePath={basePath} rows={report.data} />
          {report.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No debtors match these filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
