import { BackButton } from "@/components/back-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getHrSetupData, getStaffMember } from "@/app/actions/hr"
import { AssignmentPanel, DisciplinePanel, SalaryPanel } from "@/components/hr/staff-panels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

const label = (value: string) => value.toLowerCase().replace(/_/g, " ")

export async function StaffDetailView({
  basePath,
  staffId,
  canManage,
}: {
  basePath: string
  staffId: string
  canManage: boolean
}) {
  const [result, setup] = await Promise.all([getStaffMember(staffId), getHrSetupData()])
  if (!result.success) notFound()
  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }

  const staff = result.data
  const exited = staff.employmentStatus === "RESIGNED" || staff.employmentStatus === "TERMINATED"

  const payslipColumns: DataTableColumn[] = [
    { label: "Period" },
    { label: "Payslip No" },
    { label: "Net Pay", align: "right" },
    { label: "Status" },
    { label: "Action", printHidden: true },
  ]

  const payslipRows: DataTableRow[] = staff.payslips.map((payslip) => ({
    id: payslip.itemId,
    search: `${payslip.period} ${payslip.payslipNo} ${label(payslip.status)}`,
    cells: [
      <span className="font-medium">{payslip.period}</span>,
      payslip.payslipNo,
      formatNaira(payslip.netPay),
      label(payslip.status),
      <Button variant="outline" size="sm" asChild>
        <Link href={`${basePath}/payslips/${payslip.itemId}`}>Payslip</Link>
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton fallbackHref={`${basePath}/staff`} />
            <h1 className="text-3xl font-bold tracking-tight">{staff.name}</h1>
            <Badge variant="outline" className="capitalize">{label(staff.employmentStatus)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {staff.staffNo} · {staff.jobTitle ?? label(staff.staffType)}
            {staff.department ? ` · ${staff.department}` : ""}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${basePath}/staff/${staff.id}/edit`}>Edit record</Link>
          </Button>
        )}
      </div>

      {exited && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {staff.name} {staff.employmentStatus === "RESIGNED" ? "resigned" : "was terminated"}
          {staff.dateExited ? ` on ${new Date(staff.dateExited).toLocaleDateString()}` : ""}. Payroll no longer
          includes them, and their past payslips stay on the record.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal</CardTitle>
            <CardDescription>Contact and identity details held for this employee.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Staff number" value={staff.staffNo} />
            <Info label="Gender" value={staff.gender ? label(staff.gender) : "—"} />
            <Info label="Date of birth" value={staff.dateOfBirth ? new Date(staff.dateOfBirth).toLocaleDateString() : "—"} />
            <Info label="Phone" value={staff.phone ?? "—"} />
            <Info label="Email" value={staff.email ?? "—"} />
            <Info label="Login" value={staff.loginEmail ?? (staff.userId ? "Linked" : "No login")} />
            <Info label="Emergency contact" value={staff.emergencyContactName ?? "—"} />
            <Info label="Emergency phone" value={staff.emergencyContactPhone ?? "—"} />
            {staff.address && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Address</p>
                <p>{staff.address}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment &amp; Pay Details</CardTitle>
            <CardDescription>Where salary is sent, and the statutory identifiers.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Staff type" value={label(staff.staffType)} />
            <Info label="Employment type" value={label(staff.employmentType)} />
            <Info label="Date employed" value={new Date(staff.dateEmployed).toLocaleDateString()} />
            <Info label="Qualification" value={staff.qualification ?? "—"} />
            <Info label="Bank" value={staff.bankName ?? "—"} />
            <Info label="Account number" value={staff.accountNumber ?? "—"} />
            <Info label="Account name" value={staff.accountName ?? "—"} />
            <Info label="Pension (PFA)" value={staff.pensionPfa ?? "—"} />
            <Info label="Pension PIN" value={staff.pensionPin ?? "—"} />
            <Info label="Tax ID" value={staff.taxId ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <SalaryPanel
        staffId={staff.id}
        current={staff.currentSalary}
        history={staff.salaryHistory}
        scales={setup.data.scales}
        canManage={canManage}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AssignmentPanel
          kind="ALLOWANCE"
          staffId={staff.id}
          assignments={staff.allowances}
          types={setup.data.allowanceTypes}
          canManage={canManage}
        />
        <AssignmentPanel
          kind="DEDUCTION"
          staffId={staff.id}
          assignments={staff.deductions}
          types={setup.data.deductionTypes}
          canManage={canManage}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          <CardDescription>Every payroll this person has appeared in, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={payslipColumns}
            rows={payslipRows}
            pageSize={10}
            unit="payslips"
            searchPlaceholder="Search period or payslip number"
            emptyMessage="No payslips yet."
          />
        </CardContent>
      </Card>

      <DisciplinePanel
        staffId={staff.id}
        employmentStatus={staff.employmentStatus}
        records={staff.discipline}
        canManage={canManage}
      />
    </div>
  )
}

function Info({ label: text, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{text}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
