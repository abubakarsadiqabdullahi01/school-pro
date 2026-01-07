import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageTransition } from "@/components/dashboard/page-transition";
import { TeacherSubjectsView } from "@/components/teacher/teacher-subjects-view";
import Image from "next/image";

export default async function TeacherSubjectsPage() {
  const session = await auth();

  // Check if user is teacher
  if (!session?.user || session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  // Get the teacher's information with comprehensive data
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          credentials: {
            where: { type: "EMAIL" },
            select: { value: true },
          },
        },
      },
      school: {
        select: {
          id: true,
          name: true,
          code: true,
          logoUrl: true,
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
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  // Get all terms for this school (for term selection)
  const allTerms = await prisma.term.findMany({
    where: {
      session: {
        schoolId: teacher.schoolId,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
        },
      },
    },
    orderBy: [{ session: { startDate: "desc" } }, { startDate: "desc" }],
  });

  // Get teacher's subject assignments for current term only
  const teacherSubjects = await prisma.teacherSubject.findMany({
    where: {
      teacherId: teacher.id,
      termId: currentTerm?.id,
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      term: {
        select: {
          id: true,
          name: true,
          isCurrent: true,
        },
      },
    },
    orderBy: {
      subject: {
        name: "asc",
      },
    },
  });

  // Get teacher's class term assignments for current term only
  const teacherClassTerms = await prisma.teacherClassTerm.findMany({
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
            include: {
              session: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
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
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  year: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      avatarUrl: true,
                      gender: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              student: {
                user: {
                  firstName: "asc",
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ classTerm: { class: { name: "asc" } } }],
  });

  // Create enriched subject assignments that show which classes and terms each subject is taught in
  const enrichedSubjectAssignments = teacherSubjects.map((teacherSubject) => {
    // Find all class terms where this teacher teaches this subject
    const relevantClassTerms = teacherClassTerms.filter((tct) =>
      tct.classTerm.classSubjects.some(
        (cs) => cs.subject.id === teacherSubject.subject.id,
      ),
    );

    // Group by term for better organization
    const termGroups = relevantClassTerms.reduce(
      (acc, tct) => {
        const termId = tct.classTerm.term.id;
        if (!acc[termId]) {
          acc[termId] = {
            term: tct.classTerm.term,
            classes: [],
          };
        }

        // Safe transformation of student data with fallbacks
        const safeStudents = tct.classTerm.students.map((sct) => {
          const student = sct.student || {};
          const user = student.user || {};

          return {
            id: student.id || "",
            studentClassTermId: sct.id || "",
            admissionNo: student.admissionNo || "N/A",
            admissionYear: student.year || "N/A",
            firstName: user.firstName || "Unknown",
            lastName: user.lastName || "Student",
            fullName:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              "Unknown Student",
            avatarUrl: user.avatarUrl || null,
            gender: user.gender || null,
          };
        });

        acc[termId].classes.push({
          classTermId: tct.classTerm.id,
          classId: tct.classTerm.class.id,
          className: tct.classTerm.class.name,
          classLevel: tct.classTerm.class.level,
          studentCount: safeStudents.length,
          students: safeStudents,
        });

        return acc;
      },
      {} as Record<string, any>,
    );

    return {
      ...teacherSubject,
      termAssignments: Object.values(termGroups),
      totalClasses: relevantClassTerms.length,
      totalStudents: relevantClassTerms.reduce(
        (sum, tct) => sum + tct.classTerm.students.length,
        0,
      ),
      currentTermAssignment: relevantClassTerms.find(
        (tct) => tct.classTerm.term.isCurrent,
      ),
    };
  });

  // Calculate summary statistics (current term only)
  const summaryStats = {
    totalSubjects: teacherSubjects.length,
    totalClasses: teacherClassTerms.length,
    totalStudents: teacherClassTerms.reduce(
      (sum, tct) => sum + tct.classTerm.students.length,
      0,
    ),
    currentTermClasses: teacherClassTerms.length, // All are current term now
    currentTermSubjects: teacherSubjects.length, // All are current term now
  };

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                My Teaching Assignments
              </h1>
              <p className="text-lg text-gray-600 mt-1">
                Current term subjects and classes assigned to you
              </p>
            </div>
            {teacher.school.logoUrl && (
              <Image
                src={teacher.school.logoUrl}
                alt={`${teacher.school.name} logo`}
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
            )}
          </div>

          {/* Teacher Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">
                    {teacher.user.firstName[0]}
                    {teacher.user.lastName[0]}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {teacher.user.firstName} {teacher.user.lastName}
                  </p>
                  <p className="text-sm text-gray-500">
                    Staff ID: {teacher.staffId}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {summaryStats.totalSubjects}
                </p>
                <p className="text-sm text-gray-600">Subjects Assigned</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {summaryStats.totalClasses}
                </p>
                <p className="text-sm text-gray-600">Classes</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {summaryStats.totalStudents}
                </p>
                <p className="text-sm text-gray-600">Total Students</p>
              </div>
            </div>
          </div>

          {/* School and Term Info */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full">
              <span className="text-sm font-medium text-blue-700">School:</span>
              <span className="text-sm text-blue-900">
                {teacher.school.name} ({teacher.school.code})
              </span>
            </div>
            {teacher.department && (
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-full">
                <span className="text-sm font-medium text-purple-700">
                  Department:
                </span>
                <span className="text-sm text-purple-900">
                  {teacher.department}
                </span>
              </div>
            )}
            {teacher.qualification && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full">
                <span className="text-sm font-medium text-green-700">
                  Qualification:
                </span>
                <span className="text-sm text-green-900">
                  {teacher.qualification}
                </span>
              </div>
            )}
            {currentTerm && (
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-full">
                <span className="text-sm font-medium text-orange-700">
                  Current Term:
                </span>
                <span className="text-sm text-orange-900">
                  {currentTerm.session.name} - {currentTerm.name}
                </span>
              </div>
            )}
          </div>
        </div>

        <TeacherSubjectsView
          teacherSubjectAssignments={enrichedSubjectAssignments}
          allTerms={allTerms}
          currentTerm={currentTerm}
          teacherId={teacher.id}
          schoolId={teacher.school.id}
          teacherInfo={{
            name: `${teacher.user.firstName} ${teacher.user.lastName}`,
            staffId: teacher.staffId,
            department: teacher.department,
            qualification: teacher.qualification,
            email: teacher.user.credentials[0]?.value || "",
            avatarUrl: teacher.user.avatarUrl,
          }}
          summaryStats={summaryStats}
        />
      </div>
    </PageTransition>
  );
}
