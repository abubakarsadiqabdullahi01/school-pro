import { BackButton } from "@/components/back-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { getHrReports } from "@/app/actions/hr"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function periodName(period: string | null): string {
  if (!period) return "No payroll yet"
  const [year, month] = period.split("-")
  const index = Number(month) - 1
  return MONTH_NAMES[index] ? `${MONTH_NAMES[index]} ${year}` : period
}

/**
 * The report pack.
 *
 * The allowance, deduction and department figures come from the frozen payslip lines rather
 * than from the live configuration, so these totals always match the payslips themselves.
 */
export async function HrReportsView({ basePath, runId }: { basePath: string; runId?: string }) {
  const reports = await getHrReports({ runId })
  if (!reports.success) {
    return <p className="text-destructive">{reports.error}</p>
  }

  const { data } = reports
  const period = periodName(data.runPeriod)

  const structureTable: ExportTable = {
    columns: ["Staff No", "Name", "Department", "Job Title", "Scale", "Base Salary", "Effective From"],
    rows: data.salaryStructure.map((row) => [
      row.staffNo,
      row.name,
      row.department ?? "-",
      row.jobTitle ?? "-",
      row.scaleName ?? "-",
      formatNairaPlain(row.baseSalary),
      new Date(row.effectiveFrom).toLocaleDateString(),
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

  const departmentTable: ExportTable = {
    columns: ["Department", "Staff", "Gross", "Deductions", "Net"],
    rows: data.departmentSummary.map((row) => [
      row.department,
      String(row.staffCount),
      formatNairaPlain(row.gross),
      formatNairaPlain(row.deductions),
      formatNairaPlain(row.net),
    ]),
    csvRows: data.departmentSummary.map((row) => [
      row.department,
      String(row.staffCount),
      toCsvAmount(row.gross),
      toCsvAmount(row.deductions),
      toCsvAmount(row.net),
    ]),
  }

  const departmentColumns: DataTableColumn[] = [
    { label: "Department" },
    { label: "Staff", align: "right" },
    { label: "Gross", align: "right" },
    { label: "Deductions", align: "right" },
    { label: "Net", align: "right" },
  ]

  const departmentRows: DataTableRow[] = data.departmentSummary.map((row) => ({
    id: row.department,
    search: row.department,
    cells: [
      <span className="font-medium">{row.department}</span>,
      row.staffCount,
      formatNaira(row.gross),
      formatNaira(row.deductions),
      <span className="font-semibold">{formatNaira(row.net)}</span>,
    ],
  }))

  const unpaidColumns: DataTableColumn[] = [
    { label: "Payslip No" },
    { label: "Staff" },
    { label: "Net Pay", align: "right" },
    { label: "Status" },
  ]

  const unpaidRows: DataTableRow[] = data.unpaid.map((row) => ({
    id: row.payslipNo,
    search: `${row.payslipNo} ${row.name} ${row.staffNo} ${row.status}`,
    cells: [
      <span className="font-medium">{row.payslipNo}</span>,
      `${row.name} (${row.staffNo})`,
      formatNaira(row.netPay),
      row.status.toLowerCase(),
    ],
  }))

  const structureColumns: DataTableColumn[] = [
    { label: "Staff No" },
    { label: "Name" },
    { label: "Department" },
    { label: "Scale" },
    { label: "Base Salary", align: "right" },
    { label: "Since" },
  ]

  const structureRows: DataTableRow[] = data.salaryStructure.map((row) => ({
    id: row.staffNo,
    search: [row.staffNo, row.name, row.jobTitle ?? "", row.department ?? "", row.scaleName ?? ""].join(" "),
    cells: [
      <span className="font-medium">{row.staffNo}</span>,
      <>
        <div className="font-medium">{row.name}</div>
        <div className="text-muted-foreground">{row.jobTitle ?? "—"}</div>
      </>,
      row.department ?? "—",
      row.scaleName ?? "—",
      <span className="font-semibold">{formatNaira(row.baseSalary)}</span>,
      new Date(row.effectiveFrom).toLocaleDateString(),
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="HR Reports" reference={period} />
      <div>
        <BackButton fallbackHref={basePath} />
        <h1 className="text-3xl font-bold tracking-tight">HR Reports</h1>
        <p className="text-muted-foreground">
          Salary structure across all active staff, and the payroll breakdown for {period}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Summary
          title="Allowance Report"
          description={`What each allowance cost in ${period}.`}
          rows={data.allowanceSummary}
          empty="No allowances in that run."
        />
        <Summary
          title="Deduction Report"
          description={`What each deduction recovered in ${period}.`}
          rows={data.deductionSummary}
          empty="No deductions in that run."
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Department Payroll Summary</CardTitle>
            <CardDescription>{period}</CardDescription>
          </div>
          <BrandedReportExport title={`Department Payroll ${period}`} subtitle={period} table={departmentTable} />
        </CardHeader>
        <CardContent>
          <DataTable
            columns={departmentColumns}
            rows={departmentRows}
            pageSize={10}
            unit="departments"
            searchPlaceholder="Search by department"
            emptyMessage="No payroll to summarise yet."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Unpaid Salary</CardTitle>
            <CardDescription>Lines in {period} that have not been paid.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
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

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Salary Structure</CardTitle>
            <CardDescription>What every active staff member is currently on.</CardDescription>
          </div>
          <BrandedReportExport title="Salary Structure" subtitle="Active staff" table={structureTable} />
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
    </div>
  )
}

function Summary({
  title,
  description,
  rows,
  empty,
}: {
  title: string
  description: string
  rows: Array<{ name: string; staffCount: number; total: string }>
  empty: string
}) {
  const columns: DataTableColumn[] = [
    { label: "Name" },
    { label: "Staff", align: "right" },
    { label: "Total", align: "right" },
  ]

  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.name,
    search: row.name,
    cells: [<span className="font-medium">{row.name}</span>, row.staffCount, formatNaira(row.total)],
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={tableRows}
          pageSize={8}
          unit="entries"
          searchPlaceholder="Search by name"
          emptyMessage={empty}
        />
      </CardContent>
    </Card>
  )
}
