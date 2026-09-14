import { redirect } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { PermissionManagementView } from "@/components/permissions/permission-management-view"
import { getPermissionManagementData } from "@/app/actions/permissions"

export default async function AdminPermissionsPage() {
  const result = await getPermissionManagementData()

  if (!result.success || !result.data) {
    redirect("/dashboard/access-error")
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Permissions</h2>
          <p className="text-muted-foreground">
            Build school roles and assign them to users without changing their login account type.
          </p>
        </div>
        <PermissionManagementView data={result.data} />
      </div>
    </PageTransition>
  )
}
