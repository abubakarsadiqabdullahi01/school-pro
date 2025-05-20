import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { GradingSystemsManager } from "@/components/school-settings-management/grading-systems-manager"

export default async function GradingSystemsPage() {
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

  // Get all grading systems for the school
  const gradingSystems = await prisma.gradingSystem.findMany({
    where: {
      schoolId: admin.schoolId,
    },
    include: {
      levels: {
        orderBy: {
          maxScore: "desc",
        },
      },
    },
    orderBy: {
      isDefault: "desc",
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Grading Systems</h2>
          <p className="text-muted-foreground">
            Manage grading systems for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <GradingSystemsManager schoolId={admin.schoolId} gradingSystems={gradingSystems} />
      </div>
    </PageTransition>
  )
}
