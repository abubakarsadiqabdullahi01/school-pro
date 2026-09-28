import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassResultsTermlyComponent } from "@/components/compiler/class-results-termly"
import type { ClassLevel } from "@prisma/client"
import { requirePermission } from "@/lib/authz"
import { redirect } from "next/navigation"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminClassResultsTermlyPage() {
  const actor = await requirePermission("compiler.review_results").catch(() => null)
  if (!actor || !actor.schoolId) {
    redirect("/dashboard")
  }
  const schoolId = actor.schoolId

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: actor.userId },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          phone: true,
          email: true,
          logoUrl: true,
        },
      },
    },
  })

  const school =
    admin?.school ??
    (await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, address: true, phone: true, email: true, logoUrl: true },
    }))

  if (!school) {
    redirect("/dashboard/access-error")
  }

  // Get current term
  const currentTerm = await prisma.term.findFirst({
    where: {
      isCurrent: true,
      session: {
        schoolId,
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
        schoolId,
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
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Class Results Termly</h2>
            <InfoGuide guideKey="compiler.classResultsTermly" />
          </div>
          <p className="text-muted-foreground">
            Generate and manage termly class results for {school.name} ({school.code})
          </p>
        </div>

        <ClassResultsTermlyComponent
          schoolId={school.id}
          schoolName={school.name}
          schoolCode={school.code}
          schoolAddress={school.address || ""}
          schoolPhone={school.phone || ""}
          schoolEmail={school.email || ""}
          schoolLogo={school.logoUrl}
          terms={terms}
          currentTermId={currentTerm?.id}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
