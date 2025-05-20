import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { format } from "date-fns"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarRange, Edit, Plus } from "lucide-react"
import Link from "next/link"
import { AdminTermsTable } from "@/components/session-management/admin-terms-table"

export default async function AdminSessionDetailsPage({ params }: { params: { id: string } }) {
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

  // Fetch the session with terms, ensuring it belongs to the admin's school
  const sessionData = await prisma.session.findUnique({
    where: {
      id,
      schoolId: admin.schoolId, // Ensure the session belongs to the admin's school
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      terms: {
        orderBy: [{ isCurrent: "desc" }, { startDate: "asc" }],
      },
    },
  })

  if (!sessionData) {
    notFound()
  }

  // Format dates for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMMM d, yyyy")
  }

  // Format terms for the table
  const formattedTerms = sessionData.terms.map((term) => ({
    id: term.id,
    name: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
    isCurrent: term.isCurrent,
    createdAt: term.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{sessionData.name}</h2>
            <p className="text-muted-foreground">
              Academic session for {sessionData.school.name} ({sessionData.school.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/admin/school-sessions/edit/${sessionData.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Session
              </Link>
            </Button>
            {sessionData.isCurrent ? (
              <Button variant="outline" disabled>
                <CalendarRange className="mr-2 h-4 w-4" />
                Current Session
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={`/dashboard/admin/school-terms/create?sessionId=${sessionData.id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Term
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Session Details</CardTitle>
              <CardDescription>Basic information about this academic session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                <div className="mt-1">
                  {sessionData.isCurrent ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Current</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">School</h3>
                <p>
                  {sessionData.school.name} ({sessionData.school.code})
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Start Date</h3>
                <p>{formatDate(sessionData.startDate)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">End Date</h3>
                <p>{formatDate(sessionData.endDate)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Terms</h3>
                <p>{sessionData.terms.length} term(s)</p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Terms</CardTitle>
                <CardDescription>Terms within this academic session</CardDescription>
              </div>
              <Button asChild>
                <Link href={`/dashboard/admin/school-terms/create?sessionId=${sessionData.id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Term
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <AdminTermsTable terms={formattedTerms} sessionId={sessionData.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}
