import { prisma } from "@/lib/db"
import { AdminTermEditForm } from "@/components/session-management/admin-term-edit-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { canEditTerm } from "@/lib/term-rules"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Lock } from "lucide-react"
import Link from "next/link"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminEditTermPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, schoolId } = await requireAdminSchool("academics.manage")
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
          startDate: true,
          endDate: true,
          school: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      },
    },
  })

  if (!termData) {
    notFound()
  }

  // The row action is greyed out for an ended term, but the URL is still reachable — and a
  // form that submits only to be refused is worse than not offering the form.
  const verdict = canEditTerm(termData, actor?.role)

  if (!verdict.allowed) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-3xl font-bold tracking-tight">{termData.name}</h2>
              <InfoGuide guideKey="admin.terms" />
            </div>
            <p className="text-muted-foreground">
              {termData.session.name} · {termData.session.school.name} ({termData.session.school.code})
            </p>
          </div>

          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>This term cannot be edited</AlertTitle>
            <AlertDescription>{verdict.reason}</AlertDescription>
          </Alert>

          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/school-terms">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to terms
            </Link>
          </Button>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Academic Term</h2>
            <InfoGuide guideKey="admin.terms" />
          </div>
          <p className="text-muted-foreground">
            Update the term for {termData.session.name} - {termData.session.school.name} ({termData.session.school.code}
            )
          </p>
        </div>

        <AdminTermEditForm
          termData={{
            id: termData.id,
            name: termData.name,
            sessionId: termData.sessionId,
            sessionName: termData.session.name,
            schoolName: termData.session.school.name,
            schoolCode: termData.session.school.code,
            sessionStartDate: termData.session.startDate,
            sessionEndDate: termData.session.endDate,
            startDate: termData.startDate,
            endDate: termData.endDate,
            isCurrent: termData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
