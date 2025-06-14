import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassResultsOverview } from "@/components/class-results/ClassResultsOverview"
import type { ClassLevel } from "@prisma/client"

export default async function AdminClassResultsPage() {
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
          logoUrl: true,
          address: true,
          phone: true,
          email: true,
        },
      },
    },
  })

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error")
  }

  // Get current term
  if (!admin.schoolId) {
    throw new Error("Admin does not have a valid schoolId.")
  }

  const currentTerm = await prisma.term.findFirst({
    where: {
      isCurrent: true,
      session: {
        schoolId: admin.schoolId,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  // Get all terms for the school
  const terms = await prisma.term.findMany({
    where: {
      session: {
        schoolId: admin.schoolId,
      },
    },
    include: {
      session: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ isCurrent: "desc" }, { session: { startDate: "desc" } }, { startDate: "desc" }],
  })

  // Get all class levels
  const classLevels: ClassLevel[] = ["PRIMARY", "JSS", "SSS"]

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Class Results</h2>
          <p className="text-muted-foreground">
            View and analyze class performance results for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <ClassResultsOverview
          schoolId={admin.schoolId}
          schoolName={admin.school.name}
          schoolCode={admin.school.code}
          schoolAddress={admin.school.address}
          schoolPhone={admin.school.phone}
          schoolEmail={admin.school.email}
          schoolLogo={admin.school.logoUrl}
          terms={terms}
          currentTermId={currentTerm?.id}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
