import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"

export async function requireAdminSchool() {
  const session = await auth()

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!admin?.school) {
    redirect("/dashboard/access-error")
  }

  return {
    session,
    adminId: admin.id,
    school: admin.school,
    schoolId: admin.school.id,
  }
}
