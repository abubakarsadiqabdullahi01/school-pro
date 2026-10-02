import type { Role, StaffType } from "@prisma/client"

import type { PermissionKey } from "@/lib/permissions"

/**
 * Which HR staff types can be given a login, what it signs in as, and who may give it.
 *
 * Hiring is HR's; the access a login opens is not. A teacher login is the Teachers screen's
 * business, an accountant login opens the money, and an administrator login opens every
 * module of the school, so each needs the permission that already governs that access.
 * `users.manage` is the right gate for an administrator because it can already grant the
 * School Manager profile to any member of staff: creating the login adds no power that
 * permission did not have.
 *
 * Support staff (cleaners, drivers, security and so on) have no login. They are paid
 * through HR without ever signing in.
 */
export const STAFF_LOGINS = {
  TEACHER: { role: "TEACHER", permission: "teachers.manage", label: "teacher" },
  ACCOUNTANT: { role: "ACCOUNTANT", permission: "finance.setup", label: "finance" },
  ADMIN_STAFF: { role: "ADMIN", permission: "users.manage", label: "administrator" },
} as const satisfies Partial<Record<StaffType, { role: Role; permission: PermissionKey; label: string }>>

export type LoginStaffType = keyof typeof STAFF_LOGINS

export function isLoginStaffType(staffType: string): staffType is LoginStaffType {
  return Object.prototype.hasOwnProperty.call(STAFF_LOGINS, staffType)
}

/** The staff types this person may create logins for, given their effective permissions. */
export function loginStaffTypesFor(permissions: readonly string[]): LoginStaffType[] {
  return (Object.keys(STAFF_LOGINS) as LoginStaffType[]).filter((type) =>
    permissions.includes(STAFF_LOGINS[type].permission),
  )
}

/**
 * The logins whose sign-in follows HR employment: suspending or ending employment switches
 * them off, and only reinstating it switches them back on.
 *
 * An administrator's login follows HR too, so a dismissed school manager cannot keep running
 * the school. Two guards stop that locking a school out of itself: changing an
 * administrator's employment needs `users.manage`, and the school's last active
 * administrator cannot be suspended or let go.
 */
export const LOGINS_THAT_FOLLOW_EMPLOYMENT: ReadonlySet<Role> = new Set<Role>(["TEACHER", "ACCOUNTANT", "ADMIN"])
