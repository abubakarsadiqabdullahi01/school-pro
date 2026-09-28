import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherCreateForm, type TeacherPrefill } from "@/components/teacher-management/teacher-create-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { prisma } from "@/lib/db"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * Hiring runs through HR, so this form can start from the HR record of a teacher HR has
 * already employed (`?fromStaff=<staff id>`). The staff number carries across, which is what
 * makes createTeacher attach the new login to that record rather than opening a second one.
 */
async function prefillFromStaff(schoolId: string, staffId: string | undefined): Promise<TeacherPrefill | null> {
  if (!staffId) return null
  const staff = await prisma.staff.findFirst({
    // Only a record in this school still waiting for its login: anything else is a stale
    // or tampered link, and the form simply starts empty.
    where: { id: staffId, schoolId, userId: null },
    select: {
      staffNo: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      department: true,
      qualification: true,
      gender: true,
      dateOfBirth: true,
      address: true,
    },
  })
  if (!staff) return null
  return {
    staffId: staff.staffNo,
    firstName: staff.firstName,
    lastName: staff.lastName,
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    department: staff.department ?? "",
    qualification: staff.qualification ?? "",
    gender: staff.gender,
    dateOfBirth: staff.dateOfBirth ? staff.dateOfBirth.toISOString().slice(0, 10) : "",
    address: staff.address ?? "",
  }
}

export default async function AdminCreateTeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ fromStaff?: string | string[] }>
}) {
  const { school, schoolId } = await requireAdminSchool("teachers.manage")
  const { fromStaff } = await searchParams
  const prefill = await prefillFromStaff(schoolId, typeof fromStaff === "string" ? fromStaff : undefined)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create New Teacher</h2>
            <InfoGuide guideKey="admin.teacherCreate" />
          </div>
          <p className="text-muted-foreground">
            {prefill
              ? `Creating the login for ${prefill.firstName} ${prefill.lastName}, already employed by HR as ${prefill.staffId}.`
              : `Add a new teacher to ${school.name} (${school.code})`}
          </p>
        </div>

        <TeacherCreateForm schoolId={schoolId} schoolName={school.name} prefill={prefill} />
      </div>
    </PageTransition>
  )
}
