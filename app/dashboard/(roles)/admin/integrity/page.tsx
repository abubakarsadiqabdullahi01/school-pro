import { getSchoolIntegrityChecks } from "@/app/actions/integrity"
import { IntegrityDashboard } from "@/components/integrity/integrity-dashboard"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function IntegrityPage() {
  await requireAdminSchool("school.manage")
  const result = await getSchoolIntegrityChecks()
  return <IntegrityDashboard checks={result.success ? result.data : []} />
}
