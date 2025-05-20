import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

// Get role-specific data on the server
export async function getRoleData(userId: string, role: string) {
  try {
    switch (role) {
      case "STUDENT":
        return await prisma.student.findUnique({
          where: { userId },
          // Select only the fields you need
          select: {
            id: true,
            // Add other necessary fields based on your schema
          },
        })

      case "TEACHER":
        return await prisma.teacher.findUnique({
          where: { userId },
          select: {
            id: true,
            // Add other necessary fields based on your schema
          },
        })

      case "PARENT":
        return await prisma.parent.findUnique({
          where: { userId },
          select: {
            id: true,
            // Add other necessary fields based on your schema
          },
        })

      case "ADMIN":
        return await prisma.admin.findUnique({
          where: { userId },
          select: {
            id: true,
            // Add other necessary fields based on your schema
          },
        })

      case "SUPER_ADMIN":
        return await prisma.superAdmin.findUnique({
          where: { userId },
          select: {
            id: true,
            // Add other necessary fields based on your schema
          },
        })

      default:
        return null
    }
  } catch (error) {
    console.error(`Error fetching ${role} data:`, error)
    return null
  }
}

// Protect a route based on role
export async function protectRoute(allowedRoles: string[] = []) {
  const session = await auth()

  if (!session || !session.user) {
    redirect("/auth/login")
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(session.user.role)) {
    // User doesn't have the required role
    redirect("/dashboard")
  }

  return session
}

