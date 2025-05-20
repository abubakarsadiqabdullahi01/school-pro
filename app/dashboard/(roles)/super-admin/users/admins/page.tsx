import { UserManagementTable } from "@/components/user-management/user-management-table"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminUsersPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  // Fetch admin users
  const users = await prisma.user.findMany({
    where: { role: "ADMIN" },
    include: {
      admin: {
        include: {
          school: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      },
      credentials: {
        where: {
          type: "EMAIL",
          isPrimary: true,
        },
        select: {
          value: true,
        },
      },
    },
    orderBy: {
      firstName: "asc",
    },
  })

  // Format users for the table
  const formattedUsers = users.map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    email: user.credentials[0]?.value || "No email",
    role: "Admin",
    school: user.admin?.school ? `${user.admin.school.name} (${user.admin.school.code})` : "Not assigned",
    status: user.isActive ? "Active" : "Inactive",
    createdAt: user.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Admin Users</h2>
        <p className="text-muted-foreground">Manage administrator accounts in the system</p>
      </div>

      <UserManagementTable
        users={formattedUsers}
        userType="admin"
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "school", label: "School" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
        ]}
      />
    </div>
  )
}

