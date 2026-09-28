import { getHrReports, getPayrollRuns } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { HrReportNav } from "@/components/hr/hr-report-nav"
import { HrReportPeriodBar } from "@/components/hr/hr-report-period-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PrintLandscape } from "@/components/reports/print-orientation"
import type { ExportTable } from "@/components/reports/report-export"
import { SpendBarChart } from "@/components/reports/spend-bar-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDate } from "@/lib/format"
import {
  hrReportTabTitle,
  parseHrReportTab,
  showsSection,
  type HrReportTab,
} from "@/lib/hr/hr-report-tabs"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"
import { readParam } from "@/lib/query-filters"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

function periodName(period: string | null): string {
  if (!period) return "No payroll yet"
  const [year, month] = period.split("-")
  const index = Number(month) - 1
  return MONTH_NAMES[index] ? `${MONTH_NAMES[index]} ${year}` : period
}

// Widths total 100% on every table, so a printed report fills the sheet rather than
// stopping short of the right margin.
const departmentColumns: DataTableColumn[] = [
  { label: "Department", width: "28%" },
  { label: "Staff", align: "right", width: "10%" },
  { label: "Gross", align: "right", width: "21%" },
  { label: "Deductions", align: "right", width: "20%" },
  { label: "Net", align: "right", width: "21%" },
]

const summaryColumns: DataTableColumn[] = [
  { label: "Name", width: "50%" },
  { label: "Staff", align: "right", width: "18%" },
  { label: "Total", align: "right", width: "32%" },
]

const unpaidColumns: DataTableColumn[] = [
  { label: "Payslip No", width: "24%" },
  { label: "Staff", width: "44%" },
  { label: "Net Pay", align: "right", width: "20%" },
  { label: "Status", width: "12%" },
]

const structureColumns: DataTableColumn[] = [
  { label: "Staff No", width: "12%" },
  { label: "Name", width: "28%" },
  { label: "Department", width: "16%" },
  { label: "Scale", width: "16%" },
  { label: "Base Salary", align: "right", width: "16%" },
  { label: "Since", width: "12%" },
]

/**
 * The report pack, as tabs.
 *
 * Five reports used to sit on one page: a long scroll, and a Print that gave you all five
 * whether you wanted them or not. Each is a tab now, and the tab is in the URL — so a tab is
 * a link, the back button works, and Print produces exactly the report on screen, because
 * the others are not rendered at all. "Everything" is there for whoever files the whole pack.
 *
 * The overview leads with the shape of the month rather than another table: net pay by
 * department is a ranking, and what was added against what was recovered is a comparison.
 * Both are read off bars faster than off a column of naira.
 *
 * The allowance, deduction and department figures come from the frozen payslip lines rather
 * than from the live configuration, so these totals always match the payslips themselves.
 */
export async function HrReportsView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const listPath = `${basePath}/reports`
  const tab: HrReportTab = parseHrReportTab(searchParams)
  const runId = readParam(searchParams, "runId")

  const [reports, runs] = await Promise.all([getHrReports({ runId }), getPayrollRuns()])
  if (!reports.success) {
    return <p className="text-destructive">{reports.error}</p>
  }

  const { data } = reports
  const period = periodName(data.runPeriod)

  const gross = sumAmounts(data.departmentSummary.map((row) => row.gross))
  const deductions = sumAmounts(data.departmentSummary.map((row) => row.deductions))
  const net = sumAmounts(data.departmentSummary.map((row) => row.net))
  const staffCount = data.departmentSummary.reduce((total, row) => total + row.staffCount, 0)
  const allowanceTotal = sumAmounts(data.allowanceSummary.map((row) => row.total))
  const deductionTotal = sumAmounts(data.deductionSummary.map((row) => row.total))
  const unpaidTotal = sumAmounts(data.unpaid.map((row) => row.netPay))
  const structureTotal = sumAmounts(data.salaryStructure.map((row) => row.baseSalary))

  // ---------------------------------------------------------------------------------------
  // Export tables — one per report, so each tab exports only itself.
  // ---------------------------------------------------------------------------------------

  const departmentTable: ExportTable = {
    columns: ["Department", "Staff", "Gross", "Deductions", "Net"],
    rows: [
      ...data.departmentSummary.map((row) => [
        row.department,
        String(row.staffCount),
        formatNairaPlain(row.gross),
        formatNairaPlain(row.deductions),
        formatNairaPlain(row.net),
      ]),
      ["TOTAL", String(staffCount), formatNairaPlain(gross), formatNairaPlain(deductions), formatNairaPlain(net)],
    ],
    csvRows: [
      ...data.departmentSummary.map((row) => [
        row.department,
        String(row.staffCount),
        toCsvAmount(row.gross),
        toCsvAmount(row.deductions),
        toCsvAmount(row.net),
      ]),
      ["TOTAL", String(staffCount), toCsvAmount(gross), toCsvAmount(deductions), toCsvAmount(net)],
    ],
  }

  const summaryTable = (rows: Array<{ name: string; staffCount: number; total: string }>): ExportTable => ({
    columns: ["Name", "Staff", "Total"],
    rows: rows.map((row) => [row.name, String(row.staffCount), formatNairaPlain(row.total)]),
    csvRows: rows.map((row) => [row.name, String(row.staffCount), toCsvAmount(row.total)]),
  })

  const unpaidTable: ExportTable = {
    columns: ["Payslip No", "Staff", "Staff No", "Net Pay", "Status"],
    rows: data.unpaid.map((row) => [
      row.payslipNo,
      row.name,
      row.staffNo,
      formatNairaPlain(row.netPay),
      row.status.toLowerCase(),
    ]),
    csvRows: data.unpaid.map((row) => [
      row.payslipNo,
      row.name,
      row.staffNo,
      toCsvAmount(row.netPay),
      row.status,
    ]),
  }

  const structureTable: ExportTable = {
    columns: ["Staff No", "Name", "Department", "Job Title", "Scale", "Base Salary", "Effective From"],
    rows: data.salaryStructure.map((row) => [
      row.staffNo,
      row.name,
      row.department ?? "-",
      row.jobTitle ?? "-",
      row.scaleName ?? "-",
      formatNairaPlain(row.baseSalary),
      formatDocumentDate(row.effectiveFrom),
    ]),
    csvRows: data.salaryStructure.map((row) => [
      row.staffNo,
      row.name,
      row.department ?? "",
      row.jobTitle ?? "",
      row.scaleName ?? "",
      toCsvAmount(row.baseSalary),
      row.effectiveFrom.slice(0, 10),
    ]),
  }

  // ---------------------------------------------------------------------------------------
  // Rows. Keyed because these arrays are built on the server and cross into the client
  // payload, where React checks the elements of a list for keys.
  // ---------------------------------------------------------------------------------------

  const departmentRows: DataTableRow[] = data.departmentSummary.map((row) => ({
    id: row.department,
    search: row.department,
    cells: [
      <span key="department" className="font-medium">
        {row.department}
      </span>,
      <span key="staff" className="tabular-nums">
        {row.staffCount}
      </span>,
      <span key="gross" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.gross)}
      </span>,
      <span key="deductions" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.deductions)}
      </span>,
      <span key="net" className="whitespace-nowrap font-semibold tabular-nums">
        {formatNaira(row.net)}
      </span>,
    ],
  }))

  const departmentFooter = [
    <span key="label" className="font-semibold">
      TOTAL
    </span>,
    <span key="staff" className="tabular-nums">
      {staffCount}
    </span>,
    <span key="gross" className="whitespace-nowrap tabular-nums">
      {formatNaira(gross)}
    </span>,
    <span key="deductions" className="whitespace-nowrap tabular-nums">
      {formatNaira(deductions)}
    </span>,
    <span key="net" className="whitespace-nowrap font-semibold tabular-nums">
      {formatNaira(net)}
    </span>,
  ]

  const summaryRows = (rows: Array<{ name: string; staffCount: number; total: string }>): DataTableRow[] =>
    rows.map((row) => ({
      id: row.name,
      search: row.name,
      cells: [
        <span key="name" className="font-medium">
          {row.name}
        </span>,
        <span key="staff" className="tabular-nums">
          {row.staffCount}
        </span>,
        <span key="total" className="whitespace-nowrap tabular-nums">
          {formatNaira(row.total)}
        </span>,
      ],
    }))

  const summaryFooter = (rows: Array<{ staffCount: number; total: string }>) => [
    <span key="label" className="font-semibold">
      TOTAL
    </span>,
    <span key="staff" />,
    <span key="total" className="whitespace-nowrap font-semibold tabular-nums">
      {formatNaira(sumAmounts(rows.map((row) => row.total)))}
    </span>,
  ]

  const unpaidRows: DataTableRow[] = data.unpaid.map((row) => ({
    id: row.payslipNo,
    search: `${row.payslipNo} ${row.name} ${row.staffNo} ${row.status}`,
    cells: [
      <span key="no" className="font-medium">
        {row.payslipNo}
      </span>,
      <span key="staff">{`${row.name} (${row.staffNo})`}</span>,
      <span key="net" className="whitespace-nowrap tabular-nums">
        {formatNaira(row.netPay)}
      </span>,
      <span key="status">{row.status.toLowerCase()}</span>,
    ],
  }))

  const structureRows: DataTableRow[] = data.salaryStructure.map((row) => ({
    id: row.staffNo,
    search: [row.staffNo, row.name, row.jobTitle ?? "", row.department ?? "", row.scaleName ?? ""].join(" "),
    cells: [
      <span key="no" className="font-medium">
        {row.staffNo}
      </span>,
      <div key="name" className="min-w-0">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-muted-foreground">{row.jobTitle ?? "—"}</div>
      </div>,
      <span key="department">{row.department ?? "—"}</span>,
      <span key="scale">{row.scaleName ?? "—"}</span>,
      <span key="base" className="whitespace-nowrap font-semibold tabular-nums">
        {formatNaira(row.baseSalary)}
      </span>,
      <span key="since" className="whitespace-nowrap">
        {formatDocumentDate(row.effectiveFrom)}
      </span>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <PrintLandscape />
      <BrandedPrintHeader title={hrReportTabTitle(tab)} reference={period} />

      <div className="print:hidden">
        <BackButton fallbackHref={basePath} />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">HR Reports</h1>
          <InfoGuide guideKey="hr.reports" />
        </div>
        <p className="text-muted-foreground">
          The payroll pack for {period}. Each report is its own tab, and Print gives you the tab you are on —
          or the whole pack from Everything.
        </p>
      </div>

      {runs.success && runs.data.length > 0 && (
        <HrReportPeriodBar basePath={listPath} tab={tab} runId={runId} runs={runs.data} />
      )}

      <HrReportNav basePath={listPath} active={tab} runId={runId} />

      {tab === "overview" && (
        <>
          <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3 print:p-2">
              <p className="text-xs text-muted-foreground">Gross</p>
              <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
                {formatNaira(gross, { kobo: false })}
              </p>
              <p className="text-xs text-muted-foreground">
                {staffCount} {staffCount === 1 ? "payslip" : "payslips"} in {period}
              </p>
            </div>
            <div className="rounded-lg border p-3 print:p-2">
              <p className="text-xs text-muted-foreground">Deductions</p>
              <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
                {formatNaira(deductions, { kobo: false })}
              </p>
              <p className="text-xs text-muted-foreground">
                {Number(gross) === 0
                  ? "nothing to deduct from"
                  : `${Math.round((Number(deductions) / Number(gross)) * 100)}% of gross`}
              </p>
            </div>
            <div className="rounded-lg border p-3 print:p-2">
              <p className="text-xs text-muted-foreground">Net payroll</p>
              <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
                {formatNaira(net, { kobo: false })}
              </p>
              <p className="text-xs text-muted-foreground">what staff take home</p>
            </div>
            <div className="rounded-lg border p-3 print:p-2">
              <p className="text-xs text-muted-foreground">Unpaid</p>
              <p
                className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
                  data.unpaid.length > 0 ? "text-destructive" : ""
                }`}
              >
                {formatNaira(unpaidTotal, { kobo: false })}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.unpaid.length === 0
                  ? "everyone has been paid"
                  : `${data.unpaid.length} ${data.unpaid.length === 1 ? "line" : "lines"} outstanding`}
              </p>
            </div>
          </div>

          <Card className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle>Net pay by department</CardTitle>
              <CardDescription>
                {period} · largest first. Where the payroll actually sits, rather than how many people are in
                each department.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.departmentSummary.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No payroll to summarise yet.
                </p>
              ) : (
                <SpendBarChart
                  rows={[...data.departmentSummary]
                    .sort((a, b) => Number(b.net) - Number(a.net))
                    .map((row) => ({
                      name: row.department,
                      amount: row.net,
                      budgetLimit: null,
                      overBy: null,
                    }))}
                  valueLabel="Net pay"
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>What was added</CardTitle>
                <CardDescription>
                  Allowances in {period}, totalling {formatNaira(allowanceTotal)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.allowanceSummary.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No allowances in that run.
                  </p>
                ) : (
                  <SpendBarChart
                    rows={[...data.allowanceSummary]
                      .sort((a, b) => Number(b.total) - Number(a.total))
                      .map((row) => ({
                        name: row.name,
                        amount: row.total,
                        budgetLimit: null,
                        overBy: null,
                      }))}
                    valueLabel="Cost"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>What was recovered</CardTitle>
                <CardDescription>
                  Deductions in {period}, totalling {formatNaira(deductionTotal)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.deductionSummary.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No deductions in that run.
                  </p>
                ) : (
                  <SpendBarChart
                    rows={[...data.deductionSummary]
                      .sort((a, b) => Number(b.total) - Number(a.total))
                      .map((row) => ({
                        name: row.name,
                        amount: row.total,
                        budgetLimit: null,
                        overBy: null,
                      }))}
                    valueLabel="Recovered"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {showsSection(tab, "departments") && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Department Payroll Summary</CardTitle>
              <CardDescription>
                {data.departmentSummary.length}{" "}
                {data.departmentSummary.length === 1 ? "department" : "departments"} · {period}
              </CardDescription>
            </div>
            <div className="print:hidden">
              <BrandedReportExport
                title={`Department Payroll · ${period}`}
                subtitle={period}
                table={departmentTable}
                orientation="landscape"
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="hidden pb-2 text-sm text-muted-foreground print:block">{period}</p>
            <DataTable
              columns={departmentColumns}
              rows={departmentRows}
              pageSize={10}
              unit="departments"
              searchPlaceholder="Search by department"
              footer={departmentFooter}
              emptyMessage="No payroll to summarise yet."
            />
          </CardContent>
        </Card>
      )}

      {showsSection(tab, "allowances") && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Allowance Report</CardTitle>
              <CardDescription>What each allowance cost in {period}.</CardDescription>
            </div>
            <div className="print:hidden">
              <BrandedReportExport
                title={`Allowance Report · ${period}`}
                subtitle={period}
                table={summaryTable(data.allowanceSummary)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="hidden pb-2 text-sm text-muted-foreground print:block">{period}</p>
            <DataTable
              columns={summaryColumns}
              rows={summaryRows(data.allowanceSummary)}
              pageSize={10}
              unit="allowances"
              searchPlaceholder="Search by name"
              footer={data.allowanceSummary.length > 0 ? summaryFooter(data.allowanceSummary) : undefined}
              emptyMessage="No allowances in that run."
            />
          </CardContent>
        </Card>
      )}

      {showsSection(tab, "deductions") && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Deduction Report</CardTitle>
              <CardDescription>What each deduction recovered in {period}.</CardDescription>
            </div>
            <div className="print:hidden">
              <BrandedReportExport
                title={`Deduction Report · ${period}`}
                subtitle={period}
                table={summaryTable(data.deductionSummary)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="hidden pb-2 text-sm text-muted-foreground print:block">{period}</p>
            <DataTable
              columns={summaryColumns}
              rows={summaryRows(data.deductionSummary)}
              pageSize={10}
              unit="deductions"
              searchPlaceholder="Search by name"
              footer={data.deductionSummary.length > 0 ? summaryFooter(data.deductionSummary) : undefined}
              emptyMessage="No deductions in that run."
            />
          </CardContent>
        </Card>
      )}

      {showsSection(tab, "unpaid") && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Unpaid Salary</CardTitle>
              <CardDescription>
                {data.unpaid.length === 0
                  ? `Everyone in ${period} has been paid.`
                  : `${data.unpaid.length} ${
                      data.unpaid.length === 1 ? "line" : "lines"
                    } in ${period} worth ${formatNaira(unpaidTotal)} that have not been paid.`}
              </CardDescription>
            </div>
            <div className="print:hidden">
              <BrandedReportExport
                title={`Unpaid Salary · ${period}`}
                subtitle={period}
                table={unpaidTable}
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="hidden pb-2 text-sm text-muted-foreground print:block">{period}</p>
            <DataTable
              columns={unpaidColumns}
              rows={unpaidRows}
              pageSize={10}
              unit="lines"
              searchPlaceholder="Search payslip number or staff"
              emptyMessage="Everyone in that run has been paid."
            />
          </CardContent>
        </Card>
      )}

      {showsSection(tab, "structure") && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Salary Structure</CardTitle>
              <CardDescription>
                What every active staff member is currently on · {formatNaira(structureTotal)} a month in base
                pay.
              </CardDescription>
            </div>
            <div className="print:hidden">
              <BrandedReportExport
                title="Salary Structure"
                subtitle="Active staff"
                table={structureTable}
                orientation="landscape"
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={structureColumns}
              rows={structureRows}
              unit="staff"
              searchPlaceholder="Search staff, department or scale"
              emptyMessage="No salaries assigned yet."
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
