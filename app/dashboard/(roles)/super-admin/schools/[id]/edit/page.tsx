import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { getSchool } from "@/app/actions/school-management"
import { SchoolForm } from "@/components/school-management/school-form"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function EditSchoolPage({ params }: { params: { id: string } }) {
  const session = await auth()
  
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  const id = (await params).id
  const result = await getSchool(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const school = result.data

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit School</h2>
          <p className="text-muted-foreground">
            Update information for {school.name}
          </p>
        </div>
        <SchoolForm 
          schoolData={{
            id: school.id,
            name: school.name,
            code: school.code,
            address: school.address,
            phone: school.phone,
            email: school.email,
            website: school.website,
            logoUrl: school.logoUrl,
            admissionPrefix: school.admissionPrefix,
            admissionFormat: school.admissionFormat,
            admissionSequenceStart: school.admissionSequenceStart,
          }}
        />
      </div>
    </PageTransition>
  )
}
