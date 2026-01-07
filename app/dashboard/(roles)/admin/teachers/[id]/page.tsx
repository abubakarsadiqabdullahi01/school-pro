import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TeacherDetails } from "@/components/teacher-management/teacher-details"
import { getTeacher } from "@/app/actions/teacher-management"
import { Button } from "@/components/ui/button"
import { MoveLeft as MoveLeftIcon } from "lucide-react"

export default async function AdminTeacherDetailsPage({ params }: { params: { id: string } }) {
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

  // Fetch the teacher with related data, ensuring it belongs to the admin's school
  const teacherResult = await getTeacher(id)

  if (!teacherResult.success || !teacherResult.data) {
    notFound()
  }

  const teacherData = teacherResult.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-row justify-between">
         
           <Button variant="outline" asChild>
            <Link href={`/dashboard/admin/teachers`}>
              <MoveLeftIcon className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        <TeacherDetails teacher={teacherData} />
      </div>
    </PageTransition>
  )
}
