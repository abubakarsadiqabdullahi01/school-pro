import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { ACTIVE_SCHOOL_COOKIE, ALL_SCHOOLS, type ActiveSchool, type SchoolOption } from "@/lib/school-context"

/**
 * Server-only half of the active-school context. Reads the cookie and resolves it against
 * the database.
 *
 * Never import this from a client component — it pulls in `next/headers`. Client code
 * wants `lib/school-context.ts`, which holds the constants, types and pure helpers.
 */

/**
 * The raw cookie value. `ALL_SCHOOLS` when unset, so a super admin who has never chosen a
 * school still sees the full platform rather than an empty page.
 */
export async function getActiveSchoolId(): Promise<string> {
  const store = await cookies()
  return store.get(ACTIVE_SCHOOL_COOKIE)?.value || ALL_SCHOOLS
}

/**
 * Resolves the cookie to a real school, or null when showing all schools.
 *
 * The cookie is validated against the database on every read: a stale id left over from a
 * deleted or deactivated school must not silently filter every list down to nothing.
 */
export async function getActiveSchool(): Promise<ActiveSchool | null> {
  const id = await getActiveSchoolId()
  if (id === ALL_SCHOOLS) return null

  const school = await prisma.school.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true, code: true, logoUrl: true },
  })

  return school ?? null
}

/**
 * Spread into a Prisma `where` on a model that has a direct `schoolId`.
 * Returns `{}` for "all schools", which Prisma treats as no filter.
 */
export async function activeSchoolFilter(): Promise<{ schoolId?: string }> {
  const school = await getActiveSchool()
  return school ? { schoolId: school.id } : {}
}

/** The list a switcher offers. Inactive schools are excluded — they cannot be selected. */
export async function getSchoolOptions(): Promise<SchoolOption[]> {
  return prisma.school.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  })
}
