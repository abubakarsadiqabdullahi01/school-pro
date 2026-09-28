import { redirect } from "next/navigation"

import {
  getMyAcademicHistory,
  getMySessionReport,
  getMyTermReport,
} from "@/app/actions/student-portal"
import { AcademicHistoryView } from "@/components/portal/academic-history"
import { PageTransition } from "@/components/dashboard/page-transition"

export const metadata = { title: "My academic record" }

export default async function StudentRecordsPage() {
  // The action carries the authorization: it takes no student id and answers only for the
  // record belonging to the signed-in user.
  const result = await getMyAcademicHistory()
  if (!result.success) redirect("/dashboard/access-error")

  return (
    <PageTransition>
      <AcademicHistoryView
        history={result.data}
        loadSessionReport={getMySessionReport}
        loadTermReport={getMyTermReport}
      />
    </PageTransition>
  )
}
