import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionForm } from "@/components/session-management/session-form"
import { PageTransition } from "@/components/dashboard/page-transition"
import { notFound } from "next/navigation"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // params is a Promise in Next 16; reading .id off it gives undefined.
  const { id } = await params

  // Fetch the session to edit
  const sessionData = await prisma.session.findUnique({
    where: { id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!sessionData) {
    notFound()
  }

  // Fetch all schools for the dropdown
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
    },
  })

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">Edit Academic Session</h2>
            <InfoGuide guideKey="admin.sessions" />
          </div>
          <p className="text-muted-foreground">
            Update the academic session for {sessionData.school.name} ({sessionData.school.code})
          </p>
        </div>

        <SessionForm
          schools={schools}
          sessionData={{
            id: sessionData.id,
            name: sessionData.name,
            schoolId: sessionData.schoolId,
            startDate: sessionData.startDate,
            endDate: sessionData.endDate,
            isCurrent: sessionData.isCurrent,
          }}
        />
      </div>
    </PageTransition>
  )
}
