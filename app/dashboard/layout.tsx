import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client"

export const metadata = {
  title: "Dashboard | SchoolPro",
  description: "SchoolPro dashboard for managing school operations",
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Get the user session
  const session = await auth()

  // If no session, redirect to login
  if (!session || !session.user) {
    redirect("/auth/login")
  }

  const userRole = session.user.role || "STUDENT"
  const userName = `${session.user.firstName} ${session.user.lastName}`

  // Fetch school information for non-super-admin users
  let schoolInfo = null
  if (session.user.role !== "SUPER_ADMIN") {
    try {
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          include: {
            school: {
              select: {
                name: true,
                code: true,
                logoUrl: true,
              },
            },
          },
        })
        schoolInfo = admin?.school || null
      } else if (session.user.role === "TEACHER") {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: session.user.id },
          include: {
            school: {
              select: {
                name: true,
                code: true,
                logoUrl: true,
              },
            },
          },
        })
        schoolInfo = teacher?.school || null
      } else if (session.user.role === "STUDENT") {
        const student = await prisma.student.findUnique({
          where: { userId: session.user.id },
          include: {
            school: {
              select: {
                name: true,
                code: true,
                logoUrl: true,
              },
            },
          },
        })
        schoolInfo = student?.school || null
      } else if (session.user.role === "PARENT") {
        const parent = await prisma.parent.findUnique({
          where: { userId: session.user.id },
          include: {
            school: {
              select: {
                name: true,
                code: true,
                logoUrl: true,
              },
            },
          },
        })
        schoolInfo = parent?.school || null
      }
    } catch (error) {
      console.error("Error fetching school information:", error)
    }
  }

  return (
    <DashboardLayoutClient
      userRole={userRole}
      userName={userName}
      userAvatar={session.user.avatarUrl}
      schoolInfo={schoolInfo}
    >
      {children}
    </DashboardLayoutClient>
  )
}
