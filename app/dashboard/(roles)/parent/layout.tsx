import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Guards the whole /dashboard/parent subtree. A parent sees other people's children's
// records if this is wrong, so it is pinned to exactly one role.
export default async function ParentSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "PARENT") {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
