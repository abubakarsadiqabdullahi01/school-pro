import { notFound, redirect } from "next/navigation"

import { auth } from "@/auth"
import { PageTransition } from "@/components/dashboard/page-transition"
import { TermOverview, loadTermOverview } from "@/components/session-management/term-overview"

export default async function TermDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const { id } = await params

  // No school filter: the platform view reaches every school's terms.
  const term = await loadTermOverview(id)

  if (!term) {
    notFound()
  }

  return (
    <PageTransition>
      <TermOverview
        term={term}
        routes={{
          terms: "/dashboard/super-admin/terms",
          session: (sessionId) => `/dashboard/super-admin/sessions/${sessionId}`,
          edit: `/dashboard/super-admin/terms/edit/${term.id}`,
        }}
      />
    </PageTransition>
  )
}
