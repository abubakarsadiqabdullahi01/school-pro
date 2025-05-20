import { UserManagementTable } from "@/components/user-management/user-management-table"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function StudentUsersPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch student users
  const users = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: {
      student: {
        include: {
          currentClassTerm: {
            include: {
              class: true
            }
          }
        }
      },
      credentials: {
        where: { type: "EMAIL", isPrimary: true },
        select: { value: true },
      },
    },
    orderBy: { firstName: "asc" },
  })

  // Format users for the table
  const formattedUsers = users.map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.credentials[0]?.value || "No email",
    role: "Student",
    admissionNo: user.student?.admissionNo || "Not specified",
    class: user.student?.currentClassTerm?.class?.name || "Not assigned",
    status: user.isActive ? "Active" : "Inactive",
    createdAt: user.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Student Users</h2>
        <p className="text-muted-foreground">Manage student accounts in the system</p>
      </div>

      <UserManagementTable
        users={formattedUsers}
        userType="student"
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "admissionNo", label: "Admission No" },
          { key: "class", label: "Class" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
        ]}
      />
    </div>
  )
}

