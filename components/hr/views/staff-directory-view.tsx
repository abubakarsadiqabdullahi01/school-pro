import Link from "next/link"

import type { EmploymentStatus, StaffType } from "@prisma/client"

import { getStaffDirectory } from "@/app/actions/hr"
import { BackButton } from "@/components/back-button"
import { StaffFilterBar } from "@/components/hr/staff-filter-bar"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { PrintLandscape } from "@/components/reports/print-orientation"
import type { ExportTable } from "@/components/reports/report-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"
import { formatDocumentDate } from "@/lib/format"
import {
  countStaffFilters,
  describeStaffFilters,
  employmentStatusLabel,
  employmentTypeLabel,
  matchesSalaryFilter,
  parseStaffFilters,
  staffTypeLabel,
} from "@/lib/hr/staff-filters"
import { formatNaira, formatNairaPlain, sumAmounts, toCsvAmount } from "@/lib/money"

// Seven columns totalling 100%, on a landscape sheet — twelve fields go into the export, so
// the printed list is the wide one in this module.
const columns: DataTableColumn[] = [
  { label: "Staff No", width: "10%" },
  { label: "Name", width: "28%" },
  { label: "Department", width: "14%" },
  { label: "Type", width: "12%" },
  { label: "Salary", align: "right", width: "15%" },
  { label: "Status", width: "12%" },
  { label: "Employed", width: "9%" },
  { label: "", printHidden: true, width: "6rem" },
]

/**
 * Everyone the school employs.
 *
 * The filters used to be a GET form with an Apply button and native selects, and the table
 * carried a second search box of its own — two places to type a name, with no way to tell
 * which one was in force. It is the shared filter bar now: every select applies as it is
 * chosen, each one shows as a chip that removes itself, and the table's own search is off
 * because the server already did it.
 *
 * "Salary set or not" is a filter rather than a column footnote because it is the one fact
 * that decides whether a person can be paid at all — payroll skips them and says so.
 */
export async function StaffDirectoryView({
  basePath,
  searchParams,
  canManage,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
  canManage: boolean
}) {
  const listPath = `${basePath}/staff`

  // Read once with no filters to learn the departments this school uses, because the field
  // is free text and a department that does not exist must not reach the query.
  const known = await getStaffDirectory()
  const departments = known.success ? known.data.departments : []
  const filters = parseStaffFilters(searchParams, departments)

  const directory = await getStaffDirectory({
    search: filters.search?.trim() || null,
    department: filters.department || null,
    staffType: (filters.staffType as StaffType | undefined) ?? null,
    employmentStatus: (filters.employmentStatus as EmploymentStatus | undefined) ?? null,
  })

  if (!directory.success) {
    return <p className="text-destructive">{directory.error}</p>
  }

  const rows = directory.data.rows.filter((row) => matchesSalaryFilter(row, filters))
  const totalCount = known.success ? known.data.rows.length : rows.length
  const filtered = countStaffFilters(filters) > 0
  const scope = describeStaffFilters(filters)

  const activeCount = rows.filter((row) => row.employmentStatus === "ACTIVE").length
  const withoutSalary = rows.filter((row) => !row.baseSalary)
  const payrollCost = sumAmounts(rows.filter((row) => row.baseSalary).map((row) => row.baseSalary ?? 0))

  const exportTable: ExportTable = {
    columns: [
      "Staff No",
      "Name",
      "Gender",
      "Department",
      "Job Title",
      "Staff Type",
      "Employment Type",
      "Status",
      "Date Employed",
      "Base Salary",
      "Phone",
      "Email",
    ],
    rows: rows.map((row) => [
      row.staffNo,
      row.name,
      row.gender ?? "-",
      row.department ?? "-",
      row.jobTitle ?? "-",
      staffTypeLabel(row.staffType),
      employmentTypeLabel(row.employmentType),
      employmentStatusLabel(row.employmentStatus),
      formatDocumentDate(row.dateEmployed),
      row.baseSalary ? formatNairaPlain(row.baseSalary) : "-",
      row.phone ?? "-",
      row.email ?? "-",
    ]),
    csvRows: rows.map((row) => [
      row.staffNo,
      row.name,
      row.gender ?? "",
      row.department ?? "",
      row.jobTitle ?? "",
      row.staffType,
      row.employmentType,
      row.employmentStatus,
      row.dateEmployed.slice(0, 10),
      row.baseSalary ? toCsvAmount(row.baseSalary) : "",
      row.phone ?? "",
      row.email ?? "",
    ]),
  }

  // Keyed because this array is built on the server and crosses into the client payload,
  // where React checks the elements of a list for keys.
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    href: `${listPath}/${row.id}`,
    search: [row.staffNo, row.name, row.jobTitle ?? "", row.department ?? ""].join(" "),
    cells: [
      <span key="no" className="font-medium">
        {row.staffNo}
      </span>,
      <div key="name" className="min-w-0">
        <div className="font-medium">{row.name}</div>
        <p className="truncate text-xs text-muted-foreground">
          {row.jobTitle ?? staffTypeLabel(row.staffType)}
          {row.hasLogin ? " · has a login" : ""}
        </p>
      </div>,
      <span key="department">{row.department ?? "—"}</span>,
      <span key="type" className="whitespace-nowrap">
        {employmentTypeLabel(row.employmentType)}
      </span>,
      row.baseSalary ? (
        <span key="salary" className="whitespace-nowrap tabular-nums">
          {formatNaira(row.baseSalary)}
        </span>
      ) : (
        <span key="salary" className="whitespace-nowrap text-destructive">
          Not set
        </span>
      ),
      <div key="status" className="flex flex-col gap-1">
        <Badge
          variant={row.employmentStatus === "ACTIVE" ? "default" : "secondary"}
          className="w-fit print:hidden"
        >
          {employmentStatusLabel(row.employmentStatus)}
        </Badge>
        <span className="hidden print:block">{employmentStatusLabel(row.employmentStatus)}</span>
      </div>,
      <span key="employed" className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDocumentDate(row.dateEmployed)}
      </span>,
      <Button key="open" variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
        <Link href={`${listPath}/${row.id}`}>Open</Link>
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report>
      <PrintLandscape />
      <BrandedPrintHeader title="Employee List" reference={scope} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
            <InfoGuide guideKey="hr.staff" />
          </div>
          <p className="text-muted-foreground">
            Everyone the school employs, teaching and not. Open a record to assign a salary, an allowance or
            a deduction.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandedReportExport
            title={`Employee List · ${scope}`}
            subtitle={scope}
            table={exportTable}
            orientation="landscape"
          />
          {canManage && (
            <Button asChild>
              <Link href={`${listPath}/new`}>Add Staff</Link>
            </Button>
          )}
        </div>
      </div>

      <StaffFilterBar basePath={listPath} filters={filters} departments={departments} />

      <div className="grid gap-3 print:grid-cols-4 print:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">People</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{rows.length}</p>
          <p className="text-xs text-muted-foreground">
            {filtered ? `of ${totalCount} on the books` : `${activeCount} active`}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Monthly salary bill</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">
            {formatNaira(payrollCost, { kobo: false })}
          </p>
          <p className="text-xs text-muted-foreground">base pay, before allowances</p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">No salary set</p>
          <p
            className={`text-2xl font-bold tabular-nums print:text-[11pt] ${
              withoutSalary.length > 0 ? "text-destructive" : ""
            }`}
          >
            {withoutSalary.length}
          </p>
          <p className="text-xs text-muted-foreground">
            {withoutSalary.length === 0 ? "everybody can be paid" : "payroll will skip them"}
          </p>
        </div>
        <div className="rounded-lg border p-3 print:p-2">
          <p className="text-xs text-muted-foreground">Departments</p>
          <p className="text-2xl font-bold tabular-nums print:text-[11pt]">{departments.length}</p>
          <p className="text-xs text-muted-foreground">across the school</p>
        </div>
      </div>

      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>Employee List</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {filtered ? ` of ${totalCount} · ${scope}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="hidden pb-2 text-sm text-muted-foreground print:block">{scope}</p>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="people"
            searchable={false}
            emptyMessage={
              filtered
                ? "Nobody matches these filters. Remove one of the chips above, or clear them all."
                : "No staff on the books yet."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
