// app/dashboard/(roles)/admin/students/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import StudentEditForm from "@/components/student-management/student-edit-form";
import { BackButtonClient } from "./back-button-client"; // We'll create this
import { requireAdminSchool } from "@/lib/admin-page-context";
import { InfoGuide } from "@/components/ui/info-guide"

interface EditStudentPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditStudentPage({
  params,
}: EditStudentPageProps) {
  // Resolve dynamic params
  const { id: studentId } = await params;

  if (!studentId) {
    notFound();
  }

  await requireAdminSchool("students.manage");

  return (
    <PageTransition>
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-3xl font-bold tracking-tight">Edit Student</h1>
              <InfoGuide guideKey="admin.students" />
            </div>
            <p className="text-muted-foreground">Update student information</p>
          </div>
          {/* Client component for interactive button */}
          <BackButtonClient />
        </div>

        <StudentEditForm studentId={studentId} />
      </section>
    </PageTransition>
  );
}
