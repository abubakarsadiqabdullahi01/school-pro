import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassResultsOverview } from "@/components/class-results/ClassResultsOverview"
import type { ClassLevel } from "@prisma/client"
import { requirePermission } from "@/lib/authz"

export default async function AdminClassResultsPage() {
  const actor = await requirePermission("compiler.review_results").catch(() => null)
  if (!actor?.schoolId) {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: actor.userId },
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

  const school =
    admin?.school ??
    (await prisma.school.findUnique({
      where: { id: actor.schoolId },
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        address: true,
        phone: true,
        email: true,
      },
    }))

  // Get current term
  if (!school) {
    redirect("/dashboard/access-error")
  }

  const currentTerm = await prisma.term.findFirst({
    where: {
      isCurrent: true,
      session: {
        schoolId: actor.schoolId,
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
        schoolId: actor.schoolId,
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
            View and analyze class performance results for {school.name} ({school.code})
          </p>
        </div>

        <ClassResultsOverview
          schoolId={actor.schoolId}
          schoolName={school.name}
          schoolCode={school.code}
          schoolAddress={school.address}
          schoolPhone={school.phone}
          schoolEmail={school.email}
          schoolLogo={school.logoUrl}
          terms={terms}
          currentTermId={currentTerm?.id}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
