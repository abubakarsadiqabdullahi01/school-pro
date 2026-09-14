import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { AssignSubjectsForm } from "@/components/class-management/assign-subjects-form"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminAssignSubjectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the class, ensuring it belongs to the admin's school
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
      subjects: {
        select: {
          subjectId: true,
        },
      },
    },
  })

  if (!classData || classData.school.id !== schoolId) {
    notFound()
  }

  // Get all subjects for the school
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId,
    },
    orderBy: { name: "asc" },
  })

  // Get the IDs of subjects already assigned to the class
  const assignedSubjectIds = classData.subjects.map((s) => s.subjectId)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assign Subjects</h2>
          <p className="text-muted-foreground">
            Manage subjects for {classData.name} - {classData.school.name} ({classData.school.code})
          </p>
        </div>

        <AssignSubjectsForm
          classId={classData.id}
          className={classData.name}
          subjects={subjects}
          assignedSubjectIds={assignedSubjectIds}
        />
      </div>
    </PageTransition>
  )
}
