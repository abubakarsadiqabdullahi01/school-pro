import { BackButton } from "@/components/back-button"
import { notFound } from "next/navigation"

import { getHrSetupData, getStaffMember } from "@/app/actions/hr"
import { StaffForm } from "@/components/hr/staff-form"
import { InfoGuide } from "@/components/ui/info-guide"

export async function StaffFormView({ basePath, staffId }: { basePath: string; staffId?: string }) {
  const [setup, existing] = await Promise.all([
    getHrSetupData(),
    staffId ? getStaffMember(staffId) : Promise.resolve(null),
  ])

  if (!setup.success) {
    return <p className="text-destructive">{setup.error}</p>
  }
  if (staffId && (!existing || !existing.success)) notFound()

  const staff = existing?.success ? existing.data : undefined

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref={`${basePath}/staff`} />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{staff ? `Edit ${staff.name}` : "Add Staff"}</h1>
          <InfoGuide guideKey="hr.staffForm" />
        </div>
        <p className="text-muted-foreground">
          {staff
            ? `${staff.staffNo} · changes here do not touch salary, which keeps its own history.`
            : "Salary, allowances and deductions are assigned afterwards, on the staff record."}
        </p>
      </div>
      <StaffForm basePath={basePath} linkableUsers={setup.data.linkableUsers} staff={staff} />
    </div>
  )
}
