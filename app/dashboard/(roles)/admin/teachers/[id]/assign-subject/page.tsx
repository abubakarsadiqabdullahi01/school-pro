import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import { AssignSubjectsToTeacherForm } from "@/components/teacher-management/assign-subjects-to-teacher-form";
import { requireAdminSchool } from "@/lib/admin-page-context";

export default async function AdminAssignSubjectsPage({
  params,
}: {
  params: { id: string };
}) {
  const { schoolId } = await requireAdminSchool("teachers.manage");

  // Ensure params is properly awaited
  const id = (await params)?.id;

  // Fetch the teacher, ensuring it belongs to the admin's school
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      teacherSubjects: {
        include: {
          term: {
            select: {
              id: true,
              name: true,
              isCurrent: true,
            },
          },
        },
      },
    },
  });

  if (!teacher) {
    notFound();
  }

  if (teacher.school.id !== schoolId) {
    notFound();
  }

  // Get all subjects for the school
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: teacher.school.id,
    },
    orderBy: { name: "asc" },
  });

  // Format subjects for the form
  // Note: A subject can be assigned in multiple terms, so we track the most recent/current one
  const formattedSubjects = subjects.map((subject) => {
    const assignments = teacher.teacherSubjects.filter(
      (ts) => ts.subjectId === subject.id,
    );
    const currentAssignment = assignments.find((ts) => ts.term?.isCurrent);
    const latestAssignment = currentAssignment || assignments[0];

    return {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      isAssigned: assignments.length > 0,
      assignmentId: latestAssignment?.id,
      termId: latestAssignment?.termId,
    };
  });

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assign Subjects</h2>
          <p className="text-muted-foreground">
            Manage subjects for {teacher.user.firstName} {teacher.user.lastName}{" "}
            - {teacher.school.name} ({teacher.school.code})
          </p>
        </div>

        <AssignSubjectsToTeacherForm
          teacherId={teacher.id}
          teacherName={`${teacher.user.firstName} ${teacher.user.lastName}`}
          subjects={formattedSubjects}
        />
      </div>
    </PageTransition>
  );
}
