import { prisma } from "@/lib/db"
import { SubjectForm } from "@/components/subject-management/subject-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"

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

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Subject</h2>
          <p className="text-muted-foreground">
            Update subject for {subjectData.school.name} ({subjectData.school.code})
          </p>
        </div>

        <SubjectForm
          schoolId={schoolId}
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
