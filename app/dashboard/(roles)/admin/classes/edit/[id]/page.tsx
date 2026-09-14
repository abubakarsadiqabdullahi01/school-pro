import { prisma } from "@/lib/db"
import { ClassForm } from "@/components/class-management/class-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { requireAdminSchool } from "@/lib/admin-page-context"

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

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Class</h2>
          <p className="text-muted-foreground">
            Update class for {classData.school.name} ({classData.school.code})
          </p>
        </div>

        <ClassForm
          schoolId={schoolId}
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
