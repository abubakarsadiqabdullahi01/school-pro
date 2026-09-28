import { prisma } from "@/lib/db"
import { SubjectForm } from "@/components/subject-management/subject-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCreateSubjectPage() {
  const { school } = await requireAdminSchool("academics.manage")

  // The names and codes already in use, so a clash is caught while typing.
  const existing = await prisma.subject.findMany({
    where: { schoolId: school.id },
    select: { name: true, code: true },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/dashboard/admin/subjects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All subjects
          </Link>
        </Button>

        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create Subject</h2>
            <InfoGuide guideKey="admin.subjects" />
          </div>
          <p className="text-muted-foreground">
            Add a new subject for {school.name} ({school.code})
          </p>
        </div>

        <SubjectForm schoolId={school.id} existing={existing} />
      </div>
    </PageTransition>
  )
}
