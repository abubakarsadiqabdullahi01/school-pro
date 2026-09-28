import { prisma } from "@/lib/db"
import { ClassForm } from "@/components/class-management/class-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminEditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the class to edit, ensuring it belongs to the admin's school
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
    },
  })

  if (!classData || classData.school.id !== schoolId) {
    notFound()
  }

  const [siblings, recordedScores] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId, id: { not: id } },
      select: { name: true },
    }),
    // The section is fixed once results exist, because it decides how they are graded.
    prisma.assessment.count({
      where: { studentClassTerm: { classTerm: { classId: id } } },
    }),
  ])

  return (
    <PageTransition>
      <div className="space-y-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/dashboard/admin/classes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All classes
          </Link>
        </Button>

        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Class</h2>
            <InfoGuide guideKey="admin.classes" />
          </div>
          <p className="text-muted-foreground">
            Update class for {classData.school.name} ({classData.school.code})
          </p>
        </div>

        <ClassForm
          schoolId={schoolId}
          existingNames={siblings.map((sibling) => sibling.name)}
          recordedScores={recordedScores}
          classData={{
            id: classData.id,
            name: classData.name,
            level: classData.level,
          }}
        />
      </div>
    </PageTransition>
  )
}
