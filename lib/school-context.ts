/**
 * Active-school context for the SUPER_ADMIN flow — shared, client-safe half.
 *
 * A super admin browses every school on the platform, so each list page needs to know
 * which school is currently in focus. The selection lives in a cookie rather than React
 * state so that server components can read it while rendering.
 *
 * This module holds only constants, types, and pure helpers, so it is safe to import from
 * client components. The functions that read the cookie or hit the database live in
 * `lib/school-context.server.ts` — keeping them apart stops `next/headers` being pulled
 * into the client bundle.
 *
 * Admins, teachers, students and parents are already scoped to a single school by their
 * own records and never use any of this.
 */

export const ACTIVE_SCHOOL_COOKIE = "sp_active_school"

/** Sentinel meaning "do not filter — show every school". */
export const ALL_SCHOOLS = "all"

export type ActiveSchool = {
  id: string
  name: string
  code: string
  logoUrl: string | null
}

export type SchoolOption = {
  id: string
  name: string
  code: string
}

/**
 * Two schools can share a name — `School.name` has no unique constraint — so a name on
 * its own is not enough to identify one. Always render the code with it.
 */
export function schoolLabel(school: Pick<SchoolOption, "name" | "code">): string {
  return `${school.name} (${school.code})`
}
