import { PageTransition } from "@/components/dashboard/page-transition"
import StudentRegistrationForm from "@/components/student-management/student-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"


export default async function AdminCreateStudentPage() {
  const { school } = await requireAdminSchool("students.manage")


  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Add New Student</h2>
            <InfoGuide guideKey="admin.studentCreate" />
          </div>
          <p className="text-muted-foreground">
            Create a new student for {school.name} ({school.code})
          </p>
        </div>
        <StudentRegistrationForm />

      </div>
    </PageTransition>
  )
}


