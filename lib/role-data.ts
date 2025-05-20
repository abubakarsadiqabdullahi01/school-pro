import { prisma } from "./db"

// Function to fetch role-specific data only when needed
export async function getRoleSpecificData(userId: string, role: string) {
  try {
    switch (role) {
      case "STUDENT":
        return await prisma.student.findUnique({
          where: { userId },
          // Select only the fields you need
          select: {
            id: true,
            // grade: true,
            // section: true,
            // Add other necessary fields
          },
        })

      case "TEACHER":
        return await prisma.teacher.findUnique({
          where: { userId },
          select: {
            id: true,
            subjects: true,
            department: true,
            // Add other necessary fields
          },
        })

      case "PARENT":
        return await prisma.parent.findUnique({
          where: { userId },
          select: {
            id: true,
            // children: true,
            // Add other necessary fields
          },
        })

      case "ADMIN":
        return await prisma.admin.findUnique({
          where: { userId },
          select: {
            id: true,
            // department: true,
            // Add other necessary fields
          },
        })

      case "SUPER_ADMIN":
        return await prisma.superAdmin.findUnique({
          where: { userId },
          select: {
            id: true,
            // Add other necessary fields
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

