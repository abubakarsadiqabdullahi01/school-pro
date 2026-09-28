"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { authActive } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { ACTIVE_SCHOOL_COOKIE, ALL_SCHOOLS } from "@/lib/school-context"

/**
 * Sets the super admin's active school. Pass `ALL_SCHOOLS` to clear the filter.
 *
 * Only a SUPER_ADMIN may call this. Every other role is already scoped to one school by
 * their own record, so letting them set this cookie would imply a choice they do not have.
 */
export async function setActiveSchool(schoolId: string) {
  const session = await authActive()

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return { success: false, error: "Unauthorized" }
  }

  if (schoolId !== ALL_SCHOOLS) {
    // Validate before writing, so a bad id cannot land in the cookie and filter every
    // list down to nothing on subsequent reads.
    const school = await prisma.school.findFirst({
      where: { id: schoolId, isActive: true },
      select: { id: true },
    })

    if (!school) {
      return { success: false, error: "School not found or inactive" }
    }
  }

  const store = await cookies()
  store.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })

  // Every super-admin page reads this cookie, so the whole subtree is now stale.
  revalidatePath("/dashboard", "layout")

  return { success: true }
}
