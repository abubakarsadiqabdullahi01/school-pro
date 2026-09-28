import { prisma } from "@/lib/db"
import { SubjectForm } from "@/components/subject-management/subject-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminEditSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the subject to edit, ensuring it belongs to the admin's school
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
    },
  })

  if (!subjectData || subjectData.school.id !== schoolId) {
    notFound()
  }

  const existing = await prisma.subject.findMany({
    where: { schoolId, id: { not: id } },
    select: { name: true, code: true },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/dashboard/admin/subjects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All subjects
          </Link>
        </Button>

        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Subject</h2>
            <InfoGuide guideKey="admin.subjects" />
          </div>
          <p className="text-muted-foreground">
            Update subject for {subjectData.school.name} ({subjectData.school.code})
          </p>
        </div>

        <SubjectForm
          schoolId={schoolId}
          existing={existing}
          subjectData={{
            id: subjectData.id,
            name: subjectData.name,
            code: subjectData.code,
          }}
        />
      </div>
    </PageTransition>
  )
}
