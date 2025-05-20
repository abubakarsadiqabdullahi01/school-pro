import { UserManagementTable } from "@/components/user-management/user-management-table"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function TeacherUsersPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch teacher users
  const users = await prisma.user.findMany({
    where: { role: "TEACHER" },
    include: {
      teacher: true,
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
    role: "Teacher",
    department: user.teacher?.department || "Not specified",
    status: user.isActive ? "Active" : "Inactive",
    createdAt: user.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Teacher Users</h2>
        <p className="text-muted-foreground">Manage teacher accounts in the system</p>
      </div>

      <UserManagementTable
        users={formattedUsers}
        userType="teacher"
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "department", label: "Department" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
        ]}
      />
    </div>
  )
}

