import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import StudentRegistrationForm from "@/components/student-management/student-form"


export default async function AdminCreateStudentPage() {
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
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Add New Student</h2>
          <p className="text-muted-foreground">
            Create a new student for {admin.school.name} ({admin.school.code})
          </p>
        </div>
        <StudentRegistrationForm />

      </div>
    </PageTransition>
  )
}



