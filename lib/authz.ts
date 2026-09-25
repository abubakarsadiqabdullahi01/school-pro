import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import type { Role } from "@prisma/client"
import type { Session } from "next-auth"
import { AuthorizationError, type Actor } from "@/lib/authz-scope"
import { hasPermission, resolveEffectivePermissions, type PermissionKey } from "@/lib/permissions"
import { touchSession } from "@/lib/session-activity.server"

/**
 * The one authorization boundary.
 *
 * This replaces seven near-identical helpers that each lived privately in a server-action
 * file — four copies of `authorizeAndGetSchoolId` plus `authorizeAndGetUser`,
 * `authorizeTeacherAndGetUser` and `authorizeTeacherAndGetData`. Nothing guaranteed they
 * agreed, and adding a role or tightening a scope rule meant finding all seven.
 *
 * The rule that matters: **school scope comes from the session, never from a parameter.**
 * An action that accepts a `schoolId` from its caller is trusting the client with tenancy.
 * Use `scopeFilter(actor)` in a Prisma `where`, or `assertSchoolAccess` when an id has
 * already been resolved from a record.
 */

// The tenancy rules live in ./authz-scope so they can be unit tested without pulling in
// next-auth. They are re-exported here so callers have one import to reach for.
export {
  AuthorizationError,
  assertSchoolAccess,
  resolveTargetSchool,
  scopeFilter,
  type Actor,
} from "@/lib/authz-scope"

/**
 * Resolves the session into an actor with its school scope attached.
 *
 * Throws rather than returning null: every caller is a server action that must not proceed
 * unauthenticated, and a thrown error cannot be accidentally ignored the way a null can.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth()

  if (!session?.user?.id) {
    throw new AuthorizationError("Authentication required")
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      isActive: true,
      firstName: true,
      lastName: true,
      admin: { select: { schoolId: true } },
      teacher: { select: { id: true, schoolId: true, school: { select: { isActive: true } } } },
      parent: { select: { schoolId: true, school: { select: { isActive: true } } } },
      student: { select: { schoolId: true, school: { select: { isActive: true } } } },
      superAdmin: { select: { id: true } },
    },
  })

  if (!user) {
    throw new AuthorizationError("User profile not found")
  }

  // Checked here rather than only at sign-in: sessions are JWTs with a 30-day lifetime, so
  // a deactivated user keeps a valid token until it expires.
  if (!user.isActive) {
    throw new AuthorizationError("This account has been deactivated")
  }

  // Per-sign-in revocation, and idle expiry. `sessionRecordId` is absent on tokens issued
  // before it existed, and that must NOT be treated as revoked — doing so would sign out
  // everyone currently logged in the moment this deployed. Missing id means "no per-session
  // check"; the isActive check above still applies.
  //
  // `touchSession` both reads and writes: using the application is what counts as activity,
  // so this is the one place the clock is stamped. It is throttled to a write a minute, and
  // it revokes rather than merely rejecting an expired session — see that module.
  //
  // The school scope is resolved below, which is a chicken-and-egg problem for loading a
  // school's own timeout. `profileSchoolId` reads it straight off the loaded profile rows
  // rather than waiting for the switch, which is the same value with none of the ordering.
  const sessionRecordId = session.user.sessionRecordId
  if (sessionRecordId) {
    const profileSchoolId =
      user.admin?.schoolId ??
      user.teacher?.schoolId ??
      user.parent?.schoolId ??
      user.student?.schoolId ??
      null

    const touched = await touchSession(sessionRecordId, user.role, profileSchoolId)
    if (!touched.ok) {
      throw new AuthorizationError(touched.reason)
    }
  }

  const base = {
    userId: user.id,
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
  }

  switch (user.role) {
    case "SUPER_ADMIN":
      if (!user.superAdmin) throw new AuthorizationError("Super admin profile not found")
      return { ...base, schoolId: null, teacherId: null }

    case "ADMIN":
      if (!user.admin) throw new AuthorizationError("Admin profile not found")
      // A school-less admin row exists in the schema (schoolId is nullable) but cannot act.
      if (!user.admin.schoolId) throw new AuthorizationError("Admin not assigned to a school")
      if (!(await schoolIsActive(user.admin.schoolId))) {
        throw new AuthorizationError("This school has been deactivated")
      }
      return { ...base, schoolId: user.admin.schoolId, teacherId: null }

    case "ACCOUNTANT":
      if (!user.admin) throw new AuthorizationError("Accountant profile not found")
      if (!user.admin.schoolId) throw new AuthorizationError("Accountant not assigned to a school")
      if (!(await schoolIsActive(user.admin.schoolId))) {
        throw new AuthorizationError("This school has been deactivated")
      }
      return { ...base, schoolId: user.admin.schoolId, teacherId: null }

    case "TEACHER":
      if (!user.teacher) throw new AuthorizationError("Teacher profile not found")
      if (!user.teacher.school.isActive) throw new AuthorizationError("This school has been deactivated")
      return { ...base, schoolId: user.teacher.schoolId, teacherId: user.teacher.id }

    case "PARENT":
      if (!user.parent) throw new AuthorizationError("Parent profile not found")
      if (!user.parent.school.isActive) throw new AuthorizationError("This school has been deactivated")
      return { ...base, schoolId: user.parent.schoolId, teacherId: null }

    case "STUDENT":
      if (!user.student) throw new AuthorizationError("Student profile not found")
      if (!user.student.school.isActive) throw new AuthorizationError("This school has been deactivated")
      return { ...base, schoolId: user.student.schoolId, teacherId: null }

    default:
      throw new AuthorizationError("Unrecognised role")
  }
}

/**
 * The school a user belongs to, whatever their role.
 *
 * Only used by `accountUsable`, whose own query selects school *activity* rather than
 * school ids. Re-reading the id here keeps that query as it was rather than reshaping a
 * function several modules already depend on.
 */
async function schoolIdForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      admin: { select: { schoolId: true } },
      teacher: { select: { schoolId: true } },
      parent: { select: { schoolId: true } },
      student: { select: { schoolId: true } },
    },
  })
  return (
    user?.admin?.schoolId ??
    user?.teacher?.schoolId ??
    user?.parent?.schoolId ??
    user?.student?.schoolId ??
    null
  )
}

async function schoolIsActive(schoolId: string): Promise<boolean> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { isActive: true },
  })
  return school?.isActive === true
}

/** Resolves the actor and requires one of `allowed`. */
export async function requireRole(...allowed: Role[]): Promise<Actor> {
  const actor = await requireActor()

  if (!allowed.includes(actor.role)) {
    throw new AuthorizationError("Unauthorized")
  }

  return actor
}

async function permissionProfilesForActor(actor: Actor) {
  if (!actor.schoolId) return []

  const assignments = await prisma.userPermissionProfile.findMany({
    where: {
      userId: actor.userId,
      schoolId: actor.schoolId,
      isActive: true,
      profile: { isActive: true },
    },
    select: {
      profile: {
        select: {
          code: true,
          permissions: true,
          isActive: true,
        },
      },
    },
  })

  return assignments.map((assignment) => ({
    code: assignment.profile.code,
    permissions: Array.isArray(assignment.profile.permissions)
      ? assignment.profile.permissions.map(String)
      : [],
    isActive: assignment.profile.isActive,
  }))
}

/** Resolves the actor and requires a configurable school permission. */
export async function requirePermission(permission: PermissionKey): Promise<Actor> {
  const actor = await requireActor()
  const profiles = await permissionProfilesForActor(actor)

  if (!hasPermission(actor.role, permission, profiles)) {
    throw new AuthorizationError(`Missing permission: ${permission}`)
  }

  return actor
}

/** Resolves the actor and requires at least one configurable permission. */
export async function requireAnyPermission(permissions: readonly PermissionKey[]): Promise<Actor> {
  const actor = await requireActor()
  const profiles = await permissionProfilesForActor(actor)

  if (!permissions.some((permission) => hasPermission(actor.role, permission, profiles))) {
    throw new AuthorizationError(`Missing one of permissions: ${permissions.join(", ")}`)
  }

  return actor
}

export async function getEffectivePermissionsForCurrentUser(): Promise<PermissionKey[]> {
  const actor = await requireActor()
  const profiles = await permissionProfilesForActor(actor)
  return [...resolveEffectivePermissions(actor.role, profiles)]
}

/**
 * The common case: an action an admin runs for their own school and a super admin runs
 * across all of them.
 */
/** A teacher-only action. `teacherId` is guaranteed non-null on the result. */
export async function requireTeacher(): Promise<Actor & { teacherId: string }> {
  const actor = await requireRole("TEACHER")

  if (!actor.teacherId) {
    throw new AuthorizationError("Teacher profile not found")
  }

  return { ...actor, teacherId: actor.teacherId }
}

/**
 * Whether a signed-in account is still usable — active, and its sign-in not revoked.
 *
 * `requireActor` above already does this, but the guards in student-management and
 * parent-management predate it and read the role straight off the session. `isActive` is
 * copied into the JWT at sign-in and the token lives 30 days, so without this a deactivated
 * admin kept full access to those actions until their token expired.
 *
 * Returns a reason rather than throwing, because the two callers report failure differently.
 */
export async function accountUsable(
  userId: string,
  sessionRecordId?: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      role: true,
      admin: { select: { school: { select: { isActive: true } } } },
      teacher: { select: { school: { select: { isActive: true } } } },
      parent: { select: { school: { select: { isActive: true } } } },
      student: { select: { school: { select: { isActive: true } } } },
    },
  })

  if (!user) return { ok: false, reason: "User profile not found" }
  if (!user.isActive) return { ok: false, reason: "This account has been deactivated" }
  const schoolActive =
    user.role === "SUPER_ADMIN"
      ? true
      : user.admin?.school?.isActive ??
        user.teacher?.school.isActive ??
        user.parent?.school.isActive ??
        user.student?.school.isActive ??
        false
  if (!schoolActive) return { ok: false, reason: "This school has been deactivated" }

  // A missing id means the token predates per-session revocation and must NOT be treated as
  // revoked — see the same reasoning in requireActor.
  //
  // This goes through the same `touchSession` as requireActor rather than re-reading
  // `revokedAt` on its own, because the modules that reach `authActive` are whole screens
  // and an idle timeout that every legacy call site ignored would not be a timeout.
  if (sessionRecordId) {
    const touched = await touchSession(sessionRecordId, user.role, await schoolIdForUser(userId))
    if (!touched.ok) {
      return { ok: false, reason: touched.reason }
    }
  }

  return { ok: true }
}

/**
 * `auth()`, but nothing comes back for an account that is no longer usable.
 *
 * Modules that predate lib/authz read the role straight off the session, and there are
 * dozens of those call sites. Rather than adding a check to each one, this drops into the
 * same position as `auth()`: a deactivated or revoked session resolves to null, so the
 * `if (!session?.user)` guard already at every call site rejects it unchanged.
 */
export async function authActive(): Promise<Session | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const usable = await accountUsable(session.user.id, session.user.sessionRecordId)
  if (!usable.ok) return null

  return session
}
