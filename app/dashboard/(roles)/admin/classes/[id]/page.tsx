import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Edit } from "lucide-react"
import Link from "next/link"
import { ClassSubjectsTable } from "@/components/class-management/class-subjects-table"
import { formatNaira } from "@/lib/money"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminClassDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the class with related data, ensuring it belongs to the admin's school
  const classData = await prisma.class.findUnique({
    where: { id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      classTerms: {
        select: {
          id: true,
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
          // A fee belongs to the class term, so the term it applies to is the parent's.
          feeStructures: {
            select: {
              id: true,
              name: true,
              amount: true,
            },
          },
        },
      },
      subjects: {
        select: {
          id: true,
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
  })

  if (!classData || classData.school.id !== schoolId) {
    notFound()
  }

  // Format subjects for the table
  const formattedSubjects = classData.subjects.map((subjectRelation) => ({
    id: subjectRelation.id,
    subjectId: subjectRelation.subject.id,
    name: subjectRelation.subject.name,
    code: subjectRelation.subject.code,
  }))

  // Flatten the fees out of their class terms, carrying the term name each applies to.
  const feeStructures = classData.classTerms.flatMap((classTerm) =>
    classTerm.feeStructures.map((fee) => ({
      id: fee.id,
      name: fee.name,
      amount: fee.amount,
      termName: classTerm.term.name,
    })),
  )

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{classData.name}</h2>
            <p className="text-muted-foreground">
              Class in {classData.school.name} ({classData.school.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/classes/edit/${classData.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Class
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/classes/${classData.id}/subjects/assign`}>
                <BookOpen className="mr-2 h-4 w-4" />
                Assign Subjects
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Class Details</CardTitle>
              <CardDescription>Basic information about this class</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Class Name</h3>
                <p>{classData.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Level</h3>
                <Badge variant="outline">{classData.level}</Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">School</h3>
                <p>
                  {classData.school.name} ({classData.school.code})
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Associated Data</CardTitle>
              <CardDescription>Data linked to this class</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Terms</h3>
                <p>{classData.classTerms.length} term(s) associated with this class</p>
                {classData.classTerms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {classData.classTerms.map((termRelation) => (
                      <Badge key={termRelation.id} variant={termRelation.term.isCurrent ? "default" : "outline"}>
                        {termRelation.term.name} ({termRelation.term.session.name})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Subjects</h3>
                <p>{classData.subjects.length} subject(s) assigned to this class</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Fee Structures</h3>
                <p>{feeStructures.length} fee structure(s) defined for this class</p>
                {feeStructures.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {feeStructures.map((fee) => (
                      <div key={fee.id} className="flex justify-between text-sm">
                        <span>
                          {fee.termName} — {fee.name}:
                        </span>
                        <span className="font-medium">{formatNaira(fee.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Assigned Subjects</h3>
            <Button asChild>
              <Link href={`/dashboard/admin/classes/${classData.id}/subjects/assign`}>
                <BookOpen className="mr-2 h-4 w-4" />
                Manage Subjects
              </Link>
            </Button>
          </div>
          <ClassSubjectsTable subjects={formattedSubjects} classId={classData.id} />
        </div>
      </div>
    </PageTransition>
  )
}
