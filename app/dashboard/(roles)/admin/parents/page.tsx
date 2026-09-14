import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ParentsTable } from "@/components/parent-managements/parents-table"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminParentsPage() {
  const { school, schoolId } = await requireAdminSchool("parents.manage")

  // Fetch all parents for the admin's school with student count
  const parents = await prisma.parent.findMany({
    where: {
      schoolId,
    },
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
            select: { value: true },
          },
        },
      },
      students: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Format parents for the table
  const formattedParents = parents.map((parent) => ({
    id: parent.id,
    userId: parent.userId,
    firstName: parent.user.firstName,
    lastName: parent.user.lastName,
    email: parent.user.credentials.length > 0 ? parent.user.credentials[0].value : "",
    phone: parent.user.phone || "",
    occupation: parent.occupation || "",
    gender: parent.user.gender,
    state: parent.user.state || "",
    lga: parent.user.lga || "",
    address: parent.user.address || "",
    studentCount: parent.students.length,
    createdAt: parent.createdAt,
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Parents Management</h2>
          <p className="text-muted-foreground">
            Manage parents for {school.name} ({school.code})
          </p>
        </div>

        <ParentsTable parents={formattedParents} />
      </div>
    </PageTransition>
  )
}
