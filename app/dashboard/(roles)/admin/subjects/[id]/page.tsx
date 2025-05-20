import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, GraduationCap } from "lucide-react"
import Link from "next/link"
import { SubjectClassesTable } from "@/components/subject-management/subject-classes-table"
import { SubjectTeachersTable } from "@/components/subject-management/subject-teachers-table"

export default async function AdminSubjectDetailsPage({ params }: { params: { id: string } }) {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true },
  })

  if (!admin) {
    redirect("/dashboard/access-error")
  }

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the subject with related data, ensuring it belongs to the admin's school
  const subjectData = await prisma.subject.findUnique({
    where: { id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      classSubjects: {
        select: {
          id: true,
          class: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
          classTerm: {
            select: {
              id: true,
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
      },
      teacherSubjects: {
        select: {
          id: true,
          teacher: {
            select: {
              id: true,
              staffId: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!subjectData || subjectData.school.id !== admin.schoolId) {
    notFound()
  }

  // Format classes for the table
  const formattedClasses = subjectData.classSubjects.map((classSubject) => ({
    id: classSubject.id,
    classId: classSubject.class.id,
    className: classSubject.class.name,
    level: classSubject.class.level,
    termId: classSubject.classTerm.term.id,
    termName: classSubject.classTerm.term.name,
    isCurrent: classSubject.classTerm.term.isCurrent,
  }))

  // Format teachers for the table
  const formattedTeachers = subjectData.teacherSubjects.map((teacherSubject) => ({
    id: teacherSubject.id,
    teacherId: teacherSubject.teacher.id,
    staffId: teacherSubject.teacher.staffId,
    firstName: teacherSubject.teacher.user.firstName,
    lastName: teacherSubject.teacher.user.lastName,
    fullName: `${teacherSubject.teacher.user.firstName} ${teacherSubject.teacher.user.lastName}`,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{subjectData.name}</h2>
            <p className="text-muted-foreground">
              Subject in {subjectData.school.name} ({subjectData.school.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/subjects/edit/${subjectData.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Subject
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/subjects/${subjectData.id}/assign-teachers`}>
                <GraduationCap className="mr-2 h-4 w-4" />
                Assign Teachers
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Subject Details</CardTitle>
              <CardDescription>Basic information about this subject</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Subject Name</h3>
                <p>{subjectData.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Subject Code</h3>
                <p>{subjectData.code}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">School</h3>
                <p>
                  {subjectData.school.name} ({subjectData.school.code})
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Associated Data</CardTitle>
              <CardDescription>Data linked to this subject</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Classes</h3>
                <p>{formattedClasses.length} class(es) teaching this subject</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Teachers</h3>
                <p>{formattedTeachers.length} teacher(s) assigned to this subject</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Classes Teaching This Subject</h3>
            </div>
            <SubjectClassesTable classes={formattedClasses} subjectId={subjectData.id} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Teachers Assigned to This Subject</h3>
              <Button asChild>
                <Link href={`/dashboard/admin/subjects/${subjectData.id}/assign-teachers`}>
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Manage Teachers
                </Link>
              </Button>
            </div>
            <SubjectTeachersTable teachers={formattedTeachers} subjectId={subjectData.id} />
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
