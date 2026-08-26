import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Guards the whole /dashboard/super-admin subtree — school creation, cross-school user
// management, platform settings. Strictly SUPER_ADMIN: unlike the admin subtree, which
// deliberately admits super admins too, nothing here is meant for a school administrator.
export default async function SuperAdminSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
