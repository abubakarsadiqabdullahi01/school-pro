import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import { AssignClassesForm } from "@/components/teacher-management/assign-classes-form";

export default async function AdminAssignClassesPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  // Check if user is admin
  if (
    !session?.user ||
    (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
  ) {
    redirect("/dashboard");
  }

  // Get the admin's assigned school
  let schoolId: string | undefined;

  if (session.user.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
      select: { schoolId: true },
    });

    schoolId = admin?.schoolId ?? undefined;

    if (!schoolId) {
      redirect("/dashboard/access-error");
    }
  }

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
      teacherClassTerms: {
        select: {
          id: true,
          classTermId: true,
        },
      },
    },
  });

  if (!teacher) {
    notFound();
  }

  if (session.user.role === "ADMIN" && teacher.school.id !== schoolId) {
    notFound();
  }

  // Get all class terms for the school
  const classTerms = await prisma.classTerm.findMany({
    where: {
      class: {
        schoolId: teacher.school.id,
      },
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
      term: {
        select: {
          id: true,
          name: true,
          isCurrent: true,
          session: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { term: { isCurrent: "desc" } },
      { term: { session: { startDate: "desc" } } },
      { class: { name: "asc" } },
    ],
  });

  // Format class terms for the form
  const formattedClassTerms = classTerms.map((classTerm) => ({
    id: classTerm.id,
    className: classTerm.class.name,
    level: classTerm.class.level,
    termName: classTerm.term.name,
    termId: classTerm.term.id,
    sessionName: classTerm.term.session.name,
    isCurrent: classTerm.term.isCurrent,
    isAssigned: teacher.teacherClassTerms.some(
      (tct) => tct.classTermId === classTerm.id,
    ),
  }));

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assign Classes</h2>
          <p className="text-muted-foreground">
            Manage classes for {teacher.user.firstName} {teacher.user.lastName}{" "}
            - {teacher.school.name} ({teacher.school.code})
          </p>
        </div>

        <AssignClassesForm
          teacherId={teacher.id}
          teacherName={`${teacher.user.firstName} ${teacher.user.lastName}`}
          classTerms={formattedClassTerms}
        />
      </div>
    </PageTransition>
  );
}
