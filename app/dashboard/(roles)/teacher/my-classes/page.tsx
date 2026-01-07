import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageTransition } from "@/components/dashboard/page-transition";
import { TeacherClassesView } from "@/components/teacher/teacher-classes-view";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "lucide-react";

export default async function TeacherMyClassesPage() {
  const session = await auth();

  // Check if user is teacher
  if (!session?.user || session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  // Get the teacher's information
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!teacher || !teacher.school) {
    redirect("/dashboard/access-error");
  }

  // Get current term for the school
  const currentTerm = await prisma.term.findFirst({
    where: {
      isCurrent: true,
      session: {
        schoolId: teacher.schoolId,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Get teacher's assigned classes for current term only
  const assignedClasses = await prisma.teacherClassTerm.findMany({
    where: {
      teacherId: teacher.id,
      classTerm: {
        termId: currentTerm?.id,
      },
    },
    include: {
      classTerm: {
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
            },
          },
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      avatarUrl: true,
                      gender: true,
                    },
                  },
                },
              },
            },
          },
          classSubjects: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight">My Classes</h2>
            {currentTerm && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Current Term
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {currentTerm
              ? `Classes assigned to you for ${currentTerm.name} (${currentTerm.session.name})`
              : "No current term active"}
          </p>

          {/* Current Term Info */}
          {currentTerm && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">
                {teacher.school.name} ({teacher.school.code})
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">
                {assignedClasses.length}{" "}
                {assignedClasses.length === 1 ? "class" : "classes"} assigned
              </span>
            </div>
          )}

          {/* No Current Term Alert */}
          {!currentTerm && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertDescription className="text-sm">
                ⚠️ There is no active term. Classes will appear once a term is
                activated.
              </AlertDescription>
            </Alert>
          )}

          {/* No Classes Assigned Alert */}
          {currentTerm && assignedClasses.length === 0 && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm">
                📚 You don't have any classes assigned for the current term.
                Contact your administrator if this is incorrect.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <TeacherClassesView
          assignedClasses={assignedClasses}
          currentTerm={currentTerm}
          teacherId={teacher.id}
        />
      </div>
    </PageTransition>
  );
}
