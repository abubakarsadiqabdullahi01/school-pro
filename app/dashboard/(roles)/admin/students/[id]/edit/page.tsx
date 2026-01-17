// app/dashboard/(roles)/admin/students/[id]/edit/page.tsx
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import StudentEditForm from "@/components/student-management/student-edit-form";
import { BackButtonClient } from "./back-button-client"; // We'll create this

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

  // Authenticate user
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Authorize role
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <PageTransition>
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Student</h1>
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
