import { PageTransition } from "@/components/dashboard/page-transition"
import AcademicRecords from "@/components/student-management/academic-records"
import { requireAdminSchool } from "@/lib/admin-page-context"

interface AcademicRecordsPageProps {
  params: {
    id: string
  }
}

export default async function AcademicRecordsPage({ params }: AcademicRecordsPageProps) {
  await requireAdminSchool("students.manage")

  return (
    <PageTransition>
      <AcademicRecords studentId={params.id} />
    </PageTransition>
  )
}
