"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"

export async function getSystemAnalytics() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" }
    }

    // Total counts
    const [
      totalSchools,
      totalStudents,
      totalTeachers,
      totalAdmins,
      totalParents,
      totalSessions,
      totalTerms,
      totalClasses,
      totalSubjects,
    ] = await prisma.$transaction([
      prisma.school.count(),
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.admin.count(),
      prisma.parent.count(),
      prisma.session.count(),
      prisma.term.count(),
      prisma.class.count(),
      prisma.subject.count(),
    ])

    // Active vs Inactive Schools
    const activeSchoolsCount = await prisma.school.count({
      where: { isActive: true },
    })
    const inactiveSchoolsCount = totalSchools - activeSchoolsCount

    // User roles distribution
    const userRoles = await prisma.user.groupBy({
      by: ["role"],
      _count: {
        id: true,
      },
    })
    const userRoleDistribution = userRoles.map((item) => ({
      role: item.role,
      count: item._count.id,
    }))

    // Student enrollment over time (example: by year)
    const studentEnrollmentByYear = await prisma.student.groupBy({
      by: ["year"],
      _count: {
        id: true,
      },
      orderBy: {
        year: "asc",
      },
      where: {
        year: {
          not: null,
        },
      },
    })
    const formattedStudentEnrollment = studentEnrollmentByYear.map((item) => ({
      year: item.year?.toString() || "N/A",
      students: item._count.id,
    }))

    // School size distribution (number of students per school)
    const schoolStudentCounts = await prisma.school.findMany({
      select: {
        name: true,
        _count: {
          select: { students: true },
        },
      },
      orderBy: {
        students: {
          _count: "desc",
        },
      },
    })
    const schoolSizeDistribution = schoolStudentCounts.map((school) => ({
      schoolName: school.name,
      studentCount: school._count.students,
    }))

    // Top performing schools (based on average assessment scores - placeholder logic)
    // This requires more complex aggregation and might need a view or a custom query
    // For now, we'll just return schools with student counts as a proxy
    const topPerformingSchools = schoolStudentCounts
      .sort((a, b) => b._count.students - a._count.students)
      .slice(0, 5)
      .map((school) => ({
        schoolName: school.name,
        students: school._count.students,
        // avgScore: 0 // Placeholder
      }))

    // Recent activities (e.g., new users, new sessions, new terms)
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { firstName: true, lastName: true, role: true, createdAt: true },
    })
    const recentSessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true, school: { select: { name: true } }, createdAt: true },
    })
    const recentTerms = await prisma.term.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true, session: { select: { name: true } }, createdAt: true },
    })

    return {
      success: true,
      data: {
        totalSchools,
        totalStudents,
        totalTeachers,
        totalAdmins,
        totalParents,
        totalSessions,
        totalTerms,
        totalClasses,
        totalSubjects,
        activeSchoolsCount,
        inactiveSchoolsCount,
        userRoleDistribution,
        studentEnrollmentByYear: formattedStudentEnrollment,
        schoolSizeDistribution,
        topPerformingSchools,
        recentActivities: {
          recentUsers,
          recentSessions,
          recentTerms,
        },
      },
    }
  } catch (error: any) {
    console.error("Error fetching system analytics:", error)
    return { success: false, error: error.message || "Failed to fetch system analytics" }
  }
}
