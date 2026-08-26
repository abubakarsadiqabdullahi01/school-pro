import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Guards the whole /dashboard/admin subtree. The shared dashboard layout only checks
// that a session exists, and middleware is disabled, so without this a signed-in
// student or parent can reach admin pages. Individual pages keep their own, stricter
// checks — several of them also permit SUPER_ADMIN.
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
