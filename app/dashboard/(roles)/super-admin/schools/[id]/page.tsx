import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { getSchool } from "@/app/actions/school-management"
import { SchoolDetails } from "@/components/school-management/school-details"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function SchoolDetailsPage({ params }: { params: { id: string } }) {
  const session = await auth()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const id = (await params).id
  const result = await getSchool(id)

  if (!result.success) {
    if (result.error === "School not found") {
      notFound()
    }
    throw new Error(result.error)
  }

  return (
    <PageTransition>
      <SchoolDetails school={result.data} />
    </PageTransition>
  )
}
