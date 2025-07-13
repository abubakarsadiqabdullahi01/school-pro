import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import AcademicRecords from "@/components/student-management/academic-records"

interface AcademicRecordsPageProps {
  params: {
    id: string
  }
}

export default async function AcademicRecordsPage({ params }: AcademicRecordsPageProps) {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
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

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error")
  }

  return (
    <PageTransition>
      <AcademicRecords studentId={params.id} />
    </PageTransition>
  )
}
