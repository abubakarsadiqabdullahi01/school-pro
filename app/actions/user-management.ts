"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

// Get system statistics for super admin dashboard
export async function getSystemStats() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Get counts for all entities
    const [totalSchools, totalStudents, totalTeachers, totalAdmins, totalParents, activeSchools, recentActivities] =
      await Promise.all([
        prisma.school.count(),
        prisma.student.count(),
        prisma.teacher.count(),
        prisma.admin.count(),
        prisma.parent.count(),
        prisma.school.count({ where: { isActive: true } }),
        // Get recent activities from login attempts and user creation
        prisma.user.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            admin: { include: { school: true } },
            teacher: { include: { school: true } },
            student: { include: { school: true } },
            parent: { include: { school: true } },
          },
        }),
      ])

    const inactiveSchools = totalSchools - activeSchools

    // Format recent activities
    const formattedActivities = recentActivities.map((user) => {
      let schoolName = "System"
      let action = "joined the system"

      if (user.admin?.school) {
        schoolName = user.admin.school.name
        action = "was added as admin to"
      } else if (user.teacher?.school) {
        schoolName = user.teacher.school.name
        action = "was added as teacher to"
      } else if (user.student?.school) {
        schoolName = user.student.school.name
        action = "was enrolled in"
      } else if (user.parent?.school) {
        schoolName = user.parent.school.name
        action = "was added as parent to"
      }

      return {
        id: user.id,
        user: {
          name: `${user.firstName} ${user.lastName}`,
          role: user.role.replace("_", " "),
        },
        action,
        target: schoolName,
        date: user.createdAt,
      }
    })

    // Calculate system uptime (simplified - in real system this would come from monitoring)
    const systemUptime = 99.95

    return {
      success: true,
      data: {
        totalSchools,
        totalStudents,
        totalTeachers,
        totalAdmins,
        totalParents,
        activeSchools,
        inactiveSchools,
        systemUptime,
        recentActivities: formattedActivities,
      },
    }
  } catch (error) {
    console.error("Error fetching system stats:", error)
    return {
      success: false,
      error: "Failed to fetch system statistics",
    }
  }
}

// Get school performance data
export async function getSchoolPerformance() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Get top performing schools based on student and teacher count
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
      orderBy: {
        students: {
          _count: "desc",
        },
      },
      take: 10,
    })

    const topPerformingSchools = schools.map((school) => ({
      id: school.id,
      name: school.name,
      code: school.code,
      studentCount: school._count.students,
      teacherCount: school._count.teachers,
      performanceScore: Math.min(100, Math.round((school._count.students * 0.7 + school._count.teachers * 0.3) / 10)),
    }))

    // Generate system alerts (in real system, these would come from monitoring)
    const systemAlerts = [
      {
        id: "1",
        type: "info" as const,
        message: "System backup completed successfully",
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: "2",
        type: "warning" as const,
        message: "High database usage detected",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        id: "3",
        type: "info" as const,
        message: "New school registration pending approval",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
      },
    ]

    // Calculate monthly growth (simplified)
    const monthlyGrowth = {
      schools: Math.floor(Math.random() * 5), // In real system, calculate from actual data
      students: Math.floor(Math.random() * 100),
      teachers: Math.floor(Math.random() * 20),
    }

    return {
      success: true,
      data: {
        topPerformingSchools,
        systemAlerts,
        monthlyGrowth,
      },
    }
  } catch (error) {
    console.error("Error fetching school performance:", error)
    return {
      success: false,
      error: "Failed to fetch school performance data",
    }
  }
}

// Toggle user status (activate/deactivate)
export async function toggleUserStatus(userId: string, userType: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true },
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
    })

    // Revalidate relevant pages based on userType
    switch (userType) {
      case "admin":
        revalidatePath(`/dashboard/super-admin/users/admins`)
        revalidatePath(`/dashboard/super-admin/users/admins/${userId}`)
        break
      case "student":
        revalidatePath(`/dashboard/admin/students`)
        revalidatePath(`/dashboard/admin/students/${userId}`)
        break
      // Add other user types as needed
      default:
        revalidatePath(`/dashboard/super-admin/users`)
        break
    }

    return {
      success: true,
      message: `User ${user.isActive ? "deactivated" : "activated"} successfully`,
    }
  } catch (error) {
    console.error("Error toggling user status:", error)
    return {
      success: false,
      error: "Failed to update user status",
    }
  }
}

// Create admin user
export async function createAdminUser(data: {
  firstName: string
  lastName: string
  email: string
  phone?: string
  schoolId: string
  permissions: string[]
}) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Check if email already exists
    const existingCredential = await prisma.credential.findUnique({
      where: { value: data.email },
    })

    if (existingCredential) {
      return { success: false, error: "Email already exists" }
    }

    // Check if school exists
    const school = await prisma.school.findUnique({
      where: { id: data.schoolId },
    })

    if (!school) {
      return { success: false, error: "School not found" }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: "ADMIN",
          isActive: true,
        },
      })

      // Create credential with default password (current year)
      const defaultPassword = new Date().getFullYear().toString()
      const passwordHash = await bcrypt.hash(defaultPassword, 10)

      await tx.credential.create({
        data: {
          userId: user.id,
          type: "EMAIL",
          value: data.email,
          passwordHash,
          isPrimary: true,
        },
      })

      // Create admin record
      const admin = await tx.admin.create({
        data: {
          userId: user.id,
          schoolId: data.schoolId,
          permissions: JSON.stringify(data.permissions),
        },
      })

      return { user, admin, defaultPassword }
    })

    revalidatePath("/dashboard/super-admin/users/admins")

    return {
      success: true,
      data: {
        id: result.admin.id,
        userId: result.user.id,
        name: `${result.user.firstName} ${result.user.lastName}`,
        email: data.email,
        defaultPassword: result.defaultPassword,
      },
    }
  } catch (error) {
    console.error("Error creating admin user:", error)
    return {
      success: false,
      error: "Failed to create admin user",
    }
  }
}

// Delete user (soft delete by deactivating)
export async function deleteUser(userId: string, userType: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    })

    revalidatePath(`/dashboard/super-admin/users/${userType}s`)

    return { success: true, message: "User deactivated successfully" }
  } catch (error) {
    console.error("Error deleting user:", error)
    return {
      success: false,
      error: "Failed to delete user",
    }
  }
}

export async function getAdminDetailsById(adminId: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    if (!adminId) return { success: false, error: "Admin ID is required" }

    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            dateOfBirth: true,
            phone: true,
            gender: true,
            state: true,
            lga: true,
            address: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
            },
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    if (!admin) {
      return { success: false, error: "Admin not found" }
    }

    return { success: true, data: admin }
  } catch (error) {
    console.error("Error fetching admin details:", error)
    return { success: false, error: "Failed to fetch admin details" }
  }
}

export async function updateAdmin(
  adminId: string,
  data: {
    firstName: string
    lastName: string
    email: string
    phone: string | null
    dateOfBirth: Date | null
    gender: string | null
    state: string | null
    lga: string | null
    address: string | null
    schoolId: string | null
    permissions: string[]
  },
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: { include: { credentials: true } } },
    })

    if (!admin) {
      return { success: false, error: "Admin not found" }
    }

    // Check if email is taken by another user
    const existingCredential = await prisma.credential.findFirst({
      where: {
        value: data.email,
        userId: { not: admin.userId },
      },
    })

    if (existingCredential) {
      return { success: false, error: "Email already exists" }
    }

    // Handle schoolId - convert "NO_SCHOOL" to null
    const finalSchoolId = data.schoolId === "NO_SCHOOL" ? null : data.schoolId

    // Check if school exists if schoolId is provided
    if (finalSchoolId) {
      const school = await prisma.school.findUnique({
        where: { id: finalSchoolId },
      })

      if (!school) {
        return { success: false, error: "School not found" }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Update user details
      await tx.user.update({
        where: { id: admin.userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          state: data.state,
          lga: data.lga,
          address: data.address,
        },
      })

      // Update email if changed
      const currentCredential = admin.user.credentials.find((cred) => cred.type === "EMAIL")
      if (currentCredential && currentCredential.value !== data.email) {
        await tx.credential.update({
          where: { id: currentCredential.id },
          data: { value: data.email },
        })
      }

      // Update admin record
      await tx.admin.update({
        where: { id: adminId },
        data: {
          schoolId: finalSchoolId,
          permissions: JSON.stringify(data.permissions),
        },
      })
    })

    revalidatePath("/dashboard/super-admin/users/admins")
    revalidatePath(`/dashboard/super-admin/users/admins/${adminId}`)

    return {
      success: true,
      message: "Admin updated successfully",
    }
  } catch (error) {
    console.error("Error updating admin user:", error)
    return {
      success: false,
      error: "Failed to update admin user",
    }
  }
}

// Reset admin password
export async function resetAdminPassword(adminId: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: { include: { credentials: true } } },
    })

    if (!admin) {
      return { success: false, error: "Admin not found" }
    }

    const newPassword = "password123" // A default password, consider generating a random one
    const passwordHash = await bcrypt.hash(newPassword, 10)

    await prisma.credential.update({
      where: { userId_type: { userId: admin.userId, type: "EMAIL" } },
      data: { passwordHash },
    })

    revalidatePath(`/dashboard/super-admin/users/admins/${adminId}`)

    return {
      success: true,
      data: { newPassword },
      message: "Password reset successfully",
    }
  } catch (error) {
    console.error("Error resetting admin password:", error)
    return {
      success: false,
      error: "Failed to reset password",
    }
  }
}

export async function getAdminUsers() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

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

    const formattedUsers = users.map((user) => ({
      id: user.admin?.id || user.id, // Use admin.id if available, otherwise user.id
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

    return { success: true, data: formattedUsers }
  } catch (error) {
    console.error("Error fetching admin users:", error)
    return { success: false, error: "Failed to fetch admin users" }
  }
}
