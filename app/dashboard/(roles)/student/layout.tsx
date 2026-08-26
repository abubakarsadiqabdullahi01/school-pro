import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Guards the whole /dashboard/student subtree. Student accounts are the most likely to be
// left signed in on a shared device, so this is pinned to exactly one role.
export default async function StudentSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "STUDENT") {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
