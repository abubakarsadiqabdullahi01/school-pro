import { notFound } from "next/navigation"

import { PageTransition } from "@/components/dashboard/page-transition"
import { TermOverview, loadTermOverview } from "@/components/session-management/term-overview"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminTermDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("academics.manage")
  const { id } = await params

  // Scoped to the admin's school, so a term id from another school is a 404 rather than a
  // page that quietly shows someone else's roll and fees.
  const term = await loadTermOverview(id, schoolId)

  if (!term) {
    notFound()
  }

  return (
    <PageTransition>
      <TermOverview
        term={term}
        routes={{
          terms: "/dashboard/admin/school-terms",
          session: (sessionId) => `/dashboard/admin/school-sessions/${sessionId}`,
          fees: "/dashboard/admin/finance/fees",
        }}
      />
    </PageTransition>
  )
}
