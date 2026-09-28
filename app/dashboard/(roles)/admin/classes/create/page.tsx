import { prisma } from "@/lib/db"
import { ClassForm } from "@/components/class-management/class-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCreateClassPage() {
  const { school } = await requireAdminSchool("academics.manage")

  // The names already in use, so a duplicate is caught while typing rather than on submit.
  const existing = await prisma.class.findMany({
    where: { schoolId: school.id },
    select: { name: true },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/dashboard/admin/classes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All classes
          </Link>
        </Button>

        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create Class</h2>
            <InfoGuide guideKey="admin.classes" />
          </div>
          <p className="text-muted-foreground">
            Add a new class for {school.name} ({school.code})
          </p>
        </div>

        <ClassForm schoolId={school.id} existingNames={existing.map((cls) => cls.name)} />
      </div>
    </PageTransition>
  )
}
