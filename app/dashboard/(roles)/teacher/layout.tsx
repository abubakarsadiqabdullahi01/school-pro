import type React from "react"
import { redirect } from "next/navigation"
import { requireTeacher } from "@/lib/authz"

// Guards the whole /dashboard/teacher subtree. The shared dashboard layout only checks
// that a session exists, so without this any signed-in user could reach a teacher's
// class lists and score-entry screens by typing the URL. Individual pages keep their own
// checks as defence in depth.
export default async function TeacherSectionLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTeacher().catch(() => null)
  if (!actor) {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
