import { PageTransition } from "@/components/dashboard/page-transition"
import { ParentCreateForm } from "@/components/parent-managements/parent-create-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminCreateParentPage() {
  const { school } = await requireAdminSchool("parents.manage")

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Create New Parent</h2>
            <InfoGuide guideKey="admin.parents" />
          </div>
          <p className="text-muted-foreground">
            Add a new parent to {school.name} ({school.code})
          </p>
        </div>

        <ParentCreateForm schoolId={school.id} schoolName={school.name} />
      </div>
    </PageTransition>
  )
}
