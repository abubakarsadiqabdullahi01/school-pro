import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ParentEditForm } from "@/components/parent-managements/parent-edit-form"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminEditParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireAdminSchool("parents.manage")

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the parent to edit, ensuring it belongs to the admin's school
  const parentData = await prisma.parent.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          gender: true,
          state: true,
          lga: true,
          address: true,
          credentials: {
            where: { type: "EMAIL" },
            select: { value: true, id: true },
          },
        },
      },
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!parentData || parentData.schoolId !== schoolId) {
    notFound()
  }

  // Format the parent data for the form
  const formattedParent = {
    id: parentData.id,
    userId: parentData.userId,
    firstName: parentData.user.firstName,
    lastName: parentData.user.lastName,
    email: parentData.user.credentials.length > 0 ? parentData.user.credentials[0].value : "",
    emailCredentialId: parentData.user.credentials.length > 0 ? parentData.user.credentials[0].id : "",
    phone: parentData.user.phone || "",
    occupation: parentData.occupation || "",
    gender: parentData.user.gender,
    state: parentData.user.state || "",
    lga: parentData.user.lga || "",
    address: parentData.user.address || "",
    schoolId: parentData.school.id,
    schoolName: parentData.school.name,
    schoolCode: parentData.school.code,
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Parent</h2>
            <InfoGuide guideKey="admin.parents" />
          </div>
          <p className="text-muted-foreground">
            Update parent information for {parentData.school.name} ({parentData.school.code})
          </p>
        </div>

        <ParentEditForm parentData={formattedParent} />
      </div>
    </PageTransition>
  )
}
