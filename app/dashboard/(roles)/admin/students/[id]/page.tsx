// app/dashboard/(roles)/admin/students/[id]/page.tsx
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageTransition } from "@/components/dashboard/page-transition";
import StudentDetails from "@/components/student-management/student-details";

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

  const session = await auth();

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error");
  }

  // Optional: Verify the student exists and belongs to the admin's school
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });

    if (!student) {
      notFound();
    }

    if (student.schoolId !== admin.school.id) {
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
            Viewing student information for {admin.school.name}
          </p>
        </div>
        <StudentDetails studentId={studentId} />
      </div>
    </PageTransition>
  );
}
