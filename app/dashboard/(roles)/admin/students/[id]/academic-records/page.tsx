import { PageTransition } from "@/components/dashboard/page-transition"
import AcademicRecords from "@/components/student-management/academic-records"
import { requireAdminSchool } from "@/lib/admin-page-context"

interface AcademicRecordsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function AcademicRecordsPage({ params }: AcademicRecordsPageProps) {
  await requireAdminSchool("students.manage")
  const { id } = await params

  return (
    <PageTransition>
      <AcademicRecords studentId={id} />
    </PageTransition>
  )
}
