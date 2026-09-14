import { ClassForm } from "@/components/class-management/class-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminCreateClassPage() {
  const { school } = await requireAdminSchool("academics.manage")

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Class</h2>
          <p className="text-muted-foreground">
            Add a new class for {school.name} ({school.code})
          </p>
        </div>

        <ClassForm schoolId={school.id} />
      </div>
    </PageTransition>
  )
}
