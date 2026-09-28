import StudentList from "@/components/student-management/student-list";
import { PageTransition } from "@/components/dashboard/page-transition";
import { requireAdminSchool } from "@/lib/admin-page-context";
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminStudentsPage() {
  const { school } = await requireAdminSchool("students.manage");

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Students</h2>
            <InfoGuide guideKey="admin.students" />
          </div>
          <p className="text-muted-foreground">
            Manage students for {school.name} ({school.code})
          </p>
        </div>

        <StudentList />
      </div>
    </PageTransition>
  );
}
