// app/dashboard/(roles)/admin/students/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageTransition } from "@/components/dashboard/page-transition";
import StudentDetails from "@/components/student-management/student-details";
import { requireAdminSchool } from "@/lib/admin-page-context";

interface StudentDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function StudentDetailsPage({
  params,
}: StudentDetailsPageProps) {
  // Resolve dynamic params (Next.js 15+ requires this)
  const { id: studentId } = await params;

  if (!studentId) {
    notFound();
  }

  const { school } = await requireAdminSchool("students.manage");

  // Optional: Verify the student exists and belongs to the admin's school
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });

    if (!student) {
      notFound();
    }

    if (student.schoolId !== school.id) {
      redirect("/dashboard/access-error");
    }
  } catch (error) {
    console.error("Error verifying student:", error);
    notFound();
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Details</h1>
          <p className="text-muted-foreground">
            Viewing student information for {school.name}
          </p>
        </div>
        <StudentDetails studentId={studentId} />
      </div>
    </PageTransition>
  );
}
