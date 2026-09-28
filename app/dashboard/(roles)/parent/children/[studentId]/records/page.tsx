import { notFound } from "next/navigation"

import {
  getChildAcademicHistory,
  getChildSessionReport,
  getChildTermReport,
} from "@/app/actions/parent-portal"
import { AcademicHistoryView } from "@/components/portal/academic-history"
import { BackButton } from "@/components/back-button"
import { PageTransition } from "@/components/dashboard/page-transition"

interface RecordsPageProps {
  params: Promise<{ studentId: string }>
}

export const metadata = { title: "Academic record" }

export default async function ParentChildRecordsPage({ params }: RecordsPageProps) {
  const { studentId } = await params

  // The action carries the authorization: it answers only for a child linked to the
  // signed-in parent, so there is no second check to keep in step here.
  const result = await getChildAcademicHistory(studentId)
  if (!result.success) notFound()

  const { studentName, admissionNo, ...history } = result.data

  return (
    <PageTransition>
      <div className="space-y-4">
        <BackButton fallbackHref={`/dashboard/parent/children/${studentId}`} />
        <AcademicHistoryView
          history={history}
          personName={studentName}
          admissionNo={admissionNo}
          loadSessionReport={async (sessionId: string) => {
            "use server"
            return getChildSessionReport(studentId, sessionId)
          }}
          loadTermReport={async (termId: string) => {
            "use server"
            return getChildTermReport(studentId, termId)
          }}
        />
      </div>
    </PageTransition>
  )
}
