import StudentList from "@/components/student-management/student-list";
import { PageTransition } from "@/components/dashboard/page-transition";
import { requireAdminSchool } from "@/lib/admin-page-context";

export default async function AdminStudentsPage() {
  const { school } = await requireAdminSchool("students.manage");

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Students</h2>
          <p className="text-muted-foreground">
            Manage students for {school.name} ({school.code})
          </p>
        </div>

        <StudentList />
      </div>
    </PageTransition>
  );
}
