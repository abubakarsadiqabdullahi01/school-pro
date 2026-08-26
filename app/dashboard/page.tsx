import { redirect } from "next/navigation"
import { auth } from "@/auth"

export default async function DashboardPage() {
  // Get the user session
  const session = await auth()

  // If no session, redirect to login
  if (!session || !session.user) {
    redirect("/auth/login")
  }

  // Redirect based on role
  switch (session.user.role) {
    case "SUPER_ADMIN":
      redirect("/dashboard/super-admin")
    case "ADMIN":
      redirect("/dashboard/admin")
    case "ACCOUNTANT":
      // Finance-only staff. Admins keep the full school at /dashboard/admin/finance;
      // this tree carries the same views minus fee setup and discount approval.
      redirect("/dashboard/accountant")
    case "TEACHER":
      redirect("/dashboard/teacher")
    case "PARENT":
      redirect("/dashboard/parent")
    case "STUDENT":
      redirect("/dashboard/student")
    default:
      // Handle unexpected role - redirect to a default page
      console.warn(`Unexpected role: ${session.user.role}`)
      redirect("/dashboard/access-error")
  }
}

