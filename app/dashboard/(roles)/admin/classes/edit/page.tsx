import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AllClassesTable } from "@/components/class-management/admin-all-classes"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function AdminClassesPage() {
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

  // Fetch all classes for the admin's school
  const classes = await prisma.class.findMany({
    where: {
      schoolId: admin.school.id,
    },
    include: {
      classTerms: {
        select: {
          id: true,
        },
      },
      subjects: {
        select: {
          id: true,
        },
      },
      feeStructures: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  // Format classes for the table
  const formattedClasses = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    level: cls.level,
    schoolId: admin.school!.id,
    schoolName: admin.school!.name,
    schoolCode: admin.school!.code,
    subjectsCount: cls.subjects.length,
    termsCount: cls.classTerms.length,
    feeStructuresCount: cls.feeStructures.length,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Classes</h2>
          <p className="text-muted-foreground">
            Manage classes for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <AllClassesTable classes={formattedClasses} />
      </div>
    </PageTransition>
  )
}
