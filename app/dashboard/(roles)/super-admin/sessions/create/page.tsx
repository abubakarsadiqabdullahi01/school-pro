import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SessionForm } from "@/components/session-management/session-form"
import { PageTransition } from "@/components/dashboard/page-transition"

export default async function CreateSessionPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
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
          <h2 className="text-3xl font-bold tracking-tight">Create Academic Session</h2>
          <p className="text-muted-foreground">Add a new academic session to a school</p>
        </div>

        <SessionForm schools={schools} />
      </div>
    </PageTransition>
  )
}
