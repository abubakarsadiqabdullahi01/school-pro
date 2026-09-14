import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { ADMIN_AREA_PERMISSIONS } from "@/lib/admin-page-context"

// Guards the whole /dashboard/admin subtree. The shared dashboard layout only checks
// that a session exists, and middleware is disabled, so without this a signed-in
// student or parent can reach admin pages. Individual pages keep their own, stricter
// checks — several of them also permit SUPER_ADMIN.
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  const permissions = await getEffectivePermissionsForCurrentUser()
  if (!ADMIN_AREA_PERMISSIONS.some((permission) => permissions.includes(permission))) {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
