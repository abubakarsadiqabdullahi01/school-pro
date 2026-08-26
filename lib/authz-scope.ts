import type { Role } from "@prisma/client"

/**
 * The tenancy rules, with no dependency on the session machinery.
 *
 * These four functions are what stand between a request and another school's data, so they
 * are kept pure and separately testable — importing `@/auth` pulls in next-auth and the
 * edge runtime, which cannot load in a unit test.
 *
 * Import these from `@/lib/authz`, which re-exports them alongside the session-resolving
 * half. This module is the implementation, not the front door.
 */

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthorizationError"
  }
}

export interface Actor {
  userId: string
  role: Role
  /** Full name, for audit records that must stand alone. */
  name: string
  /**
   * The school this actor is confined to, or `null` for a super admin, who spans every
   * school. `null` means "no filter", not "no access" — check `role` when that matters.
   */
  schoolId: string | null
  /** Set only when the actor is a teacher. */
  teacherId: string | null
}

/**
 * Spread into a Prisma `where` on any model with a direct `schoolId`.
 * Returns `{}` for a super admin, which Prisma treats as no filter.
 */
export function scopeFilter(actor: Actor): { schoolId?: string } {
  return actor.schoolId ? { schoolId: actor.schoolId } : {}
}

/**
 * Asserts an actor may act on a school id that was resolved from a record — the check to
 * use once you have loaded the class term, term, or student the request names.
 *
 * A super admin passes for any school. Everyone else must match exactly. An unknown school
 * fails closed: if the caller could not establish which school the record belongs to, that
 * is a reason to refuse, not to proceed.
 */
export function assertSchoolAccess(actor: Actor, schoolId: string | null | undefined): void {
  if (actor.role === "SUPER_ADMIN") return

  if (!schoolId || schoolId !== actor.schoolId) {
    throw new AuthorizationError("This record belongs to a different school")
  }
}

/**
 * Resolves which school a write should land in.
 *
 * For a scoped actor this is always their own school, whatever the caller passed. For a
 * super admin, who has no school of their own, the id must be resolved from the record
 * being written — pass it in. Never pass a value straight from a request body.
 */
export function resolveTargetSchool(actor: Actor, schoolIdFromRecord?: string | null): string {
  if (actor.schoolId) return actor.schoolId

  if (!schoolIdFromRecord) {
    throw new AuthorizationError("Could not determine which school this action applies to")
  }

  return schoolIdFromRecord
}
