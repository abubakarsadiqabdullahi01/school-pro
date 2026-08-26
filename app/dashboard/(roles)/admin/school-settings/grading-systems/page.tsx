import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { GradingSystemsManager } from "@/components/school-settings-management/grading-systems-manager"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function GradingSystemsPage() {
  const { school, schoolId } = await requireAdminSchool()

  const gradingSystems = await prisma.gradingSystem.findMany({
    where: {
      schoolId,
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
        <div className="flex items-center justify-between gap-4"> 
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Grading Systems</h1>
          <p className="text-muted-foreground">Manage grading systems for {school.name} ({school.code})</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/admin/school-settings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Link>
        </Button>
      </div>
        <GradingSystemsManager schoolId={schoolId} gradingSystems={gradingSystems} />
      </div>
    </PageTransition>
  )
}
