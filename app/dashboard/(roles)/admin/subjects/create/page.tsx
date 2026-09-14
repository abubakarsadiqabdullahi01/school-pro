import { SubjectForm } from "@/components/subject-management/subject-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminCreateSubjectPage() {
  const { school } = await requireAdminSchool("academics.manage")

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Subject</h2>
          <p className="text-muted-foreground">
            Add a new subject for {school.name} ({school.code})
          </p>
        </div>

        <SubjectForm schoolId={school.id} />
      </div>
    </PageTransition>
  )
}
