import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { AdminTermEditForm } from "@/components/session-management/admin-term-edit-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"

export default async function AdminEditTermPage({ params }: { params: { id: string } }) {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true },
  })

  if (!admin) {
    redirect("/dashboard/access-error")
  }

  // Ensure params is properly awaited
  const id = (await params)?.id

  // Fetch the term to edit, ensuring it belongs to the admin's school
  const termData = await prisma.term.findUnique({
    where: { id },
    include: {
      session: {
        select: {
          id: true,
          name: true,
          schoolId: true,
          startDate: true,
          endDate: true,
          school: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      },
    },
  })

  if (!termData || termData.session.schoolId !== admin.schoolId) {
    notFound()
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Edit Academic Term</h2>
          <p className="text-muted-foreground">
            Update the term for {termData.session.name} - {termData.session.school.name} ({termData.session.school.code}
            )
          </p>
        </div>

        <AdminTermEditForm
          termData={{
            id: termData.id,
            name: termData.name,
            sessionId: termData.sessionId,
            sessionName: termData.session.name,
            schoolName: termData.session.school.name,
            schoolCode: termData.session.school.code,
            sessionStartDate: termData.session.startDate,
            sessionEndDate: termData.session.endDate,
            startDate: termData.startDate,
            endDate: termData.endDate,
            isCurrent: termData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
