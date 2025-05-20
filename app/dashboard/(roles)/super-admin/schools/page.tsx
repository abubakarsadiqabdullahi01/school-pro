import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { SchoolsTable } from "@/components/school-management/schools-table"

export default async function SchoolsPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch all schools
  const schools = await prisma.school.findMany({
    include: {
      _count: {
        select: {
          students: true,
          teachers: true,
          admins: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  // Format schools for the table
  const formattedSchools = schools.map((school) => ({
    id: school.id,
    name: school.name,
    code: school.code,
    email: school.email,
    phone: school.phone,
    students: school._count.students,
    teachers: school._count.teachers,
    admins: school._count.admins,
    status: school.isActive ? "Active" : "Inactive",
    createdAt: school.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Schools</h2>
        <p className="text-muted-foreground">Manage schools in the system</p>
      </div>

      <SchoolsTable schools={formattedSchools} />
    </div>
  )
}

