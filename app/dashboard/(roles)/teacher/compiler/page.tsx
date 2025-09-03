import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, BookOpen } from "lucide-react"
import Link from "next/link"

export default async function TeacherCompilerPage() {
  const session = await auth()

  // Check if user is teacher
  if (!session?.user || session.user.role !== "TEACHER") {
    redirect("/dashboard")
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
      teacherSubjects: {
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
      teacherClassTerms: {
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
                  isCurrent: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!teacher || !teacher.school) {
    redirect("/dashboard/access-error")
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assessment Compiler</h2>
          <p className="text-muted-foreground">
            Manage assessments and generate reports for {teacher.school.name} ({teacher.school.code})
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <CardTitle>Continuous Assessment Sheet</CardTitle>
                  <CardDescription>Generate CA sheets for your assigned subjects</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>• Generate blank CA sheets for score entry</p>
                <p>• Print-ready format with school branding</p>
                <p>• Only subjects you teach are available</p>
              </div>
              <Button asChild className="w-full">
                <Link href="/dashboard/teacher/compiler/continuous-assessments">
                  <FileText className="mr-2 h-4 w-4" />
                  Generate CA Sheet
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <BookOpen className="h-8 w-8 text-green-600" />
                <div>
                  <CardTitle>Subject Result Entry</CardTitle>
                  <CardDescription>Enter and manage student assessment scores</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>• Enter CA1, CA2, CA3, and Exam scores</p>
                <p>• Automatic grade calculation</p>
                <p>• Publish results when complete</p>
              </div>
              <Button asChild className="w-full">
                <Link href="/dashboard/teacher/compiler/subject-results/entry">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Enter Results
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
