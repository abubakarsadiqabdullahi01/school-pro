import { prisma } from "@/lib/db"
import { format } from "date-fns"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowBigLeft,  CalendarRange } from "lucide-react"
import Link from "next/link"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminTermDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")
  const { id } = await params

  const termData = await prisma.term.findFirst({
    where: {
      id,
      session: { schoolId },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          schoolId: true,
          school: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      classTerms: {
        select: {
          id: true,
        },
      },
      assessments: {
        select: {
          id: true,
        },
      },
    },
  })

  // Fees hang off ClassTerm rather than Term, so they are counted through it.
  const feeStructureCount = termData
    ? await prisma.feeStructure.count({ where: { classTerm: { termId: termData.id } } })
    : 0

  if (!termData) {
    notFound()
  }

  // Format dates for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMMM d, yyyy")
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{termData.name}</h2>
            <p className="text-muted-foreground">
              Term for {termData.session.name} - {termData.session.school.name} ({termData.session.school.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/school-terms/edit/${termData.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Term
              </Link>
            </Button> */}
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/school-terms`}>
                <ArrowBigLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            {termData.isCurrent ? (
              <Button variant="outline" disabled>
                <CalendarRange className="mr-2 h-4 w-4" />
                Current Term
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={`/dashboard/admin/school-sessions/${termData.sessionId}`}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  View Session
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Term Details</CardTitle>
              <CardDescription>Basic information about this academic term</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                <div className="mt-1">
                  {termData.isCurrent ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Current</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Session</h3>
                <p>{termData.session.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">School</h3>
                <p>
                  {termData.session.school.name} ({termData.session.school.code})
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Start Date</h3>
                <p>{formatDate(termData.startDate)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">End Date</h3>
                <p>{formatDate(termData.endDate)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Associated Data</CardTitle>
              <CardDescription>Data linked to this academic term</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Classes</h3>
                <p>{termData.classTerms.length} class(es) associated with this term</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Assessments</h3>
                <p>{termData.assessments.length} assessment(s) configured for this term</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Fee Structures</h3>
                <p>{feeStructureCount} fee structure(s) defined for this term</p>
              </div>
              <div className="pt-4">
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/dashboard/admin/school-sessions/${termData.sessionId}`}>View Parent Session</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
