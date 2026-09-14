import { BackButton } from "@/components/back-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import Link from "next/link"

import type { EmploymentStatus, StaffType } from "@prisma/client"

import { getStaffDirectory } from "@/app/actions/hr"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import type { ExportTable } from "@/components/reports/report-export"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

const STAFF_TYPES: StaffType[] = [
  "TEACHER", "ADMIN_STAFF", "ACCOUNTANT", "CLEANER", "DRIVER", "SECURITY", "LIBRARIAN", "NURSE", "OTHER",
]
const STATUSES: EmploymentStatus[] = ["ACTIVE", "SUSPENDED", "RESIGNED", "TERMINATED"]

type Filters = { search?: string; department?: string; staffType?: string; employmentStatus?: string }

/** Only a real enum value reaches the query; a hand-edited URL is ignored, not trusted. */
function oneOf<T extends string>(allowed: T[], raw?: string): T | null {
  return allowed.includes(raw as T) ? (raw as T) : null
}

const label = (value: string) => value.toLowerCase().replace(/_/g, " ")

export async function StaffDirectoryView({
  basePath,
  filters,
  canManage,
}: {
  basePath: string
  filters: Filters
  canManage: boolean
}) {
  const directory = await getStaffDirectory({
    search: filters.search?.trim() || null,
    department: filters.department || null,
    staffType: oneOf(STAFF_TYPES, filters.staffType),
    employmentStatus: oneOf(STATUSES, filters.employmentStatus),
  })

  if (!directory.success) {
    return <p className="text-destructive">{directory.error}</p>
  }

  const { rows, departments } = directory.data

  const exportTable: ExportTable = {
    columns: [
      "Staff No", "Name", "Gender", "Department", "Job Title", "Staff Type",
      "Employment Type", "Status", "Date Employed", "Base Salary", "Phone", "Email",
    ],
    rows: rows.map((row) => [
      row.staffNo,
      row.name,
      row.gender ?? "-",
      row.department ?? "-",
      row.jobTitle ?? "-",
      label(row.staffType),
      label(row.employmentType),
      label(row.employmentStatus),
      new Date(row.dateEmployed).toLocaleDateString(),
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

  const columns: DataTableColumn[] = [
    { label: "Staff No" },
    { label: "Name" },
    { label: "Department" },
    { label: "Type" },
    { label: "Salary", align: "right" },
    { label: "Status" },
    { label: "Action", printHidden: true },
  ]

  // The filter form above narrows the query server-side; this box is the quick scan within
  // whatever came back, which is what somebody looking for one name actually wants.
  const tableRows: DataTableRow[] = rows.map((row) => ({
    id: row.id,
    search: [
      row.staffNo,
      row.name,
      row.jobTitle ?? "",
      row.department ?? "",
      label(row.employmentType),
      label(row.employmentStatus),
    ].join(" "),
    cells: [
      <span className="font-medium">{row.staffNo}</span>,
      <>
        <div className="font-medium">{row.name}</div>
        <div className="text-muted-foreground">
          {row.jobTitle ?? label(row.staffType)}
          {row.hasLogin ? " · has a login" : ""}
        </div>
      </>,
      row.department ?? "—",
      label(row.employmentType),
      row.baseSalary ? formatNaira(row.baseSalary) : <span className="text-destructive">Not set</span>,
      <Badge variant="outline" className="capitalize">{label(row.employmentStatus)}</Badge>,
      <Button variant="outline" size="sm" asChild>
        <Link href={`${basePath}/staff/${row.id}`}>Open</Link>
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Employee List" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
          <p className="text-muted-foreground">Everyone the school employs, teaching and not.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandedReportExport title="Employee List" subtitle="Staff directory" table={exportTable} />
          {canManage && (
            <Button size="sm" asChild>
              <Link href={`${basePath}/staff/new`}>Add Staff</Link>
            </Button>
          )}
        </div>
      </div>

      {/* A plain GET form: filters land in the URL, so a filtered list can be shared and the
          back button behaves. */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium" htmlFor="search">Search</label>
              <Input id="search" name="search" defaultValue={filters.search ?? ""} placeholder="Name, staff number, or job title" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="department">Department</label>
              <select
                id="department"
                name="department"
                defaultValue={filters.department ?? ""}
                className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">Any department</option>
                {departments.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="staffType">Staff type</label>
              <select
                id="staffType"
                name="staffType"
                defaultValue={filters.staffType ?? ""}
                className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">Any type</option>
                {STAFF_TYPES.map((type) => (
                  <option key={type} value={type}>{label(type)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="employmentStatus">Status</label>
              <select
                id="employmentStatus"
                name="employmentStatus"
                defaultValue={filters.employmentStatus ?? ""}
                className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">Any status</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{label(status)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 lg:col-span-5">
              <Button type="submit" size="sm">Apply</Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`${basePath}/staff`}>Clear</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
          <CardDescription>{rows.length} {rows.length === 1 ? "person" : "people"}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="people"
            searchPlaceholder="Search name, staff number, department"
            emptyMessage="Nobody matches these filters."
          />
        </CardContent>
      </Card>
    </div>
  )
}
