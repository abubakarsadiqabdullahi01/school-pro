import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageTransition } from "@/components/dashboard/page-transition";
import { AssignmentsManager } from "@/components/teacher-management/assignments/assignments-manager";
import { getTeacher } from "@/app/actions/teacher-management";
import {
  getAvailableClassTerms,
  getAvailableSubjects,
} from "@/app/actions/teacher-assignment";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TeacherAssignmentsPageProps {
  params: {
    id: string;
  };
}

export default async function TeacherAssignmentsPage({
  params,
}: TeacherAssignmentsPageProps) {
  const { id } = await params;
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

  // Fetch teacher details
  const teacherResult = await getTeacher(id);
  if (!teacherResult.success || !teacherResult.data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive">
              Teacher Not Found
            </h3>
            <p className="text-muted-foreground">
              {teacherResult.error ||
                "The teacher you're looking for doesn't exist."}
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/admin/teachers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Teachers
              </Link>
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // Fetch available class terms and subjects
  const [classTermsResult, subjectsResult] = await Promise.all([
    getAvailableClassTerms(),
    getAvailableSubjects(),
  ]);

  const availableClassTerms =
    classTermsResult.success && classTermsResult.data
      ? classTermsResult.data
      : [];
  const availableSubjects =
    subjectsResult.success && subjectsResult.data ? subjectsResult.data : [];

  const teacher = teacherResult.data;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/admin/teachers/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Profile
            </Link>
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{teacher.fullName}</span>
            <span>•</span>
            <span>{teacher.staffId}</span>
          </div>
        </div>

        {/* School Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Teacher Assignment Management</span>
              <div className="text-sm font-normal text-muted-foreground">
                {admin.school.name} ({admin.school.code})
              </div>
            </CardTitle>
            <CardDescription>
              Manage class and subject assignments for{" "}
              <span className="font-medium">{teacher.fullName}</span>. Current
              assignments are highlighted and term-based filtering is available.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Assignments Manager */}
        <AssignmentsManager
          teacher={{
            id: teacher.id,
            userId: teacher.userId,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            fullName: teacher.fullName,
            staffId: teacher.staffId,
            department: teacher.department,
            classes: teacher.classes.map((c) => ({
              id: c.id,
              classTermId: c.classTermId,
              className: c.className,
              classLevel: c.classLevel,
              termName: c.termName,
              sessionName: c.sessionName,
              isCurrent: c.isCurrent,
            })),
            subjects: teacher.subjects.map((s) => ({
              id: s.id,
              subjectId: s.subjectId,
              name: s.name,
              code: s.code,
            })),
          }}
          availableClassTerms={availableClassTerms}
          availableSubjects={availableSubjects}
        />

        {/* Error States */}
        {!classTermsResult.success && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <p className="font-medium text-destructive">
                  Error loading class terms
                </p>
                <p className="text-sm">{classTermsResult.error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!subjectsResult.success && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <p className="font-medium text-destructive">
                  Error loading subjects
                </p>
                <p className="text-sm">{subjectsResult.error}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
