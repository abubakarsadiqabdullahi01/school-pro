import { cache } from "react"

import { prisma } from "@/lib/db"
import { requireActor } from "@/lib/authz"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * The school's identity as it appears on a printed document.
 *
 * Finance, expenditure and HR all print letterheads, and before this they each carried only
 * a name and a code — while the compiler's report card had the full masthead with logo,
 * address and contact line. One helper, so every document in the system looks like it came
 * from the same school.
 *
 * Server-only: it resolves the actor's school from the session, never from a parameter.
 */
export type SchoolBranding = {
  name: string
  code: string
  address: string
  phone: string
  email: string
  website: string | null
  logoUrl: string | null
}

/**
 * Wrapped in React's `cache` so a page that prints two exports and a letterhead resolves the
 * school once per request rather than three times.
 */
export const getSchoolBranding = cache(async (): Promise<SchoolBranding | null> => {
  try {
    const actor = await requireActor()

    // Admins and accountants carry their school; a super admin picks one with the switcher.
    let schoolId = actor.schoolId
    if (!schoolId && actor.role === "SUPER_ADMIN") {
      schoolId = (await getActiveSchool())?.id ?? null
    }
    if (!schoolId) return null

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
      },
    })

    return school
  } catch {
    // A document should still print without its letterhead rather than fail outright, so a
    // missing session or school degrades to no branding rather than throwing.
    return null
  }
})
