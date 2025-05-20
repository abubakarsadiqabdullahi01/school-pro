import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SchoolForm } from "@/components/school-management/school-form"

export default async function AddSchoolPage() {
  const session = await auth()

  // Check if user is super admin
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add School</h2>
        <p className="text-muted-foreground">Create a new school in the system</p>
      </div>

      <SchoolForm />
    </div>
  )
}

