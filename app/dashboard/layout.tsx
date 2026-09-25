import type React from "react"
import { redirect } from "next/navigation"
import { authActive, getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client"
import { IdleSessionWatcher } from "@/components/session/idle-session-watcher"
import { getActiveSchool, getSchoolOptions } from "@/lib/school-context.server"

// Every dashboard screen depends on the signed-in user and school selection. Declaring
// this at the shared boundary avoids wasteful prerender attempts and noisy build-time
// authentication errors for every child route.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dashboard | DigiSchool-Pro",
  description: "DigiSchool-Pro dashboard for managing school operations",
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Get the user session
  const session = await authActive()

  // If no session, redirect to login
  if (!session || !session.user) {
    redirect("/auth/login")
  }

  const userRole = session.user.role || "STUDENT"
  const userName = `${session.user.firstName} ${session.user.lastName}`

  // A super admin browses every school, so they get a switcher instead of a fixed school.
  // Everyone else is pinned to the school on their own record.
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const [schoolOptions, activeSchool, permissions] = isSuperAdmin
    ? await Promise.all([getSchoolOptions(), getActiveSchool(), getEffectivePermissionsForCurrentUser()])
    : [[], null, await getEffectivePermissionsForCurrentUser()]

  // Fetch school information for non-super-admin users
  let schoolInfo = null
  if (session.user.role !== "SUPER_ADMIN") {
    try {
      if (session.user.role === "ADMIN" || session.user.role === "ACCOUNTANT") {
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
      userId={session.user.id}
      userRole={userRole}
      userName={userName}
      userAvatar={session.user.avatarUrl}
      schoolInfo={schoolInfo}
      schoolOptions={schoolOptions}
      activeSchool={activeSchool}
      permissions={permissions}
    >
      {/*
        Mounted once for the whole dashboard rather than per page, so the countdown
        survives navigation. It renders nothing until a session is close to expiring.
      */}
      <IdleSessionWatcher />
      {children}
    </DashboardLayoutClient>
  )
}
