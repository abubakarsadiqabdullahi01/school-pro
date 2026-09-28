import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { CASheetComponent } from "@/components/compiler/ca-sheet"
import { ClassLevel } from '@prisma/client';
import { requirePermission } from "@/lib/authz"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCASheetPage() {
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
      select: { id: true, name: true, code: true, logoUrl: true, address: true, phone: true, email: true },
    }))

  if (!school) {
    redirect("/dashboard/access-error")
  }

  // Get current term
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
const classLevels: ClassLevel[] = ["PRIMARY", "JSS", "SSS"];

return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Continuous Assessment Sheet</h2>
            <InfoGuide guideKey="compiler.continuousAssessments" />
          </div>
          <p className="text-muted-foreground">
            Manage and view continuous assessments for {school.name} ({school.code})
          </p>
        </div>

        <CASheetComponent
          schoolId={actor.schoolId}
          schoolName={school.name}
          schoolCode={school.code}
          schoolLogo={school.logoUrl}
          schoolAddress={school.address}
          schoolPhone={school.phone}
          schoolEmail={school.email}
          terms={terms}
          currentTermId={currentTerm?.id}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
