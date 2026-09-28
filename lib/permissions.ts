import type { Role } from "@prisma/client"

export const PERMISSIONS = [
  "school.manage",
  "users.manage",
  "students.manage",
  "teachers.manage",
  "parents.manage",
  "academics.manage",
  "compiler.enter_scores",
  "compiler.review_results",
  "compiler.publish_results",
  "compiler.lock_results",
  "compiler.configure_policy",
  "finance.setup",
  "finance.manage_gateway",
  "finance.approve_refunds",
  "finance.collect_payments",
  "finance.view_reports",
  "expenditure.manage",
  "expenditure.approve",
  "payroll.manage",
  "payroll.pay",
  "reports.export",
] as const

export type PermissionKey = (typeof PERMISSIONS)[number]

export type PermissionProfileInput = {
  code: string
  permissions: readonly string[]
  isActive?: boolean
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  "school.manage": "Manage school settings",
  "users.manage": "Manage users and permissions",
  "students.manage": "Manage students",
  "teachers.manage": "Hire and manage teachers",
  "parents.manage": "Manage parents",
  "academics.manage": "Academic setup and teacher assignment",
  "compiler.enter_scores": "Enter compiler scores",
  "compiler.review_results": "Review results",
  "compiler.publish_results": "Publish or withdraw results",
  "compiler.lock_results": "Lock results",
  "compiler.configure_policy": "Configure promotion policy",
  "finance.setup": "Configure finance",
  "finance.manage_gateway": "Manage online payment gateway",
  "finance.approve_refunds": "Approve online payment refunds",
  "finance.collect_payments": "Collect payments",
  "finance.view_reports": "View finance reports",
  "expenditure.manage": "Manage expenditure",
  "expenditure.approve": "Approve expenditure",
  "payroll.manage": "Manage payroll setup",
  "payroll.pay": "Run and pay payroll",
  "reports.export": "Export reports",
}

/**
 * The permission grid, grouped by the module each key opens rather than by who happened to
 * need it first.
 *
 * Before, "Administration" held teachers next to school settings and "Money" held finance,
 * expenditure and payroll in one block of nine, so granting HR meant picking two keys out
 * of a list about fees. Each group now matches a sidebar section, which is how a school
 * thinks about the job being handed out. Presentation only: no key changed name.
 */
export const PERMISSION_GROUPS: Array<{ name: string; permissions: PermissionKey[] }> = [
  {
    name: "School administration",
    permissions: ["school.manage", "users.manage"],
  },
  {
    name: "Students and parents",
    permissions: ["students.manage", "parents.manage"],
  },
  {
    name: "Academics and results",
    permissions: [
      "academics.manage",
      "compiler.enter_scores",
      "compiler.review_results",
      "compiler.publish_results",
      "compiler.lock_results",
      "compiler.configure_policy",
    ],
  },
  {
    name: "Human resources",
    permissions: ["teachers.manage", "payroll.manage", "payroll.pay"],
  },
  {
    name: "Finance",
    permissions: [
      "finance.setup",
      "finance.manage_gateway",
      "finance.approve_refunds",
      "finance.collect_payments",
      "finance.view_reports",
    ],
  },
  {
    name: "Expenditure",
    permissions: ["expenditure.manage", "expenditure.approve"],
  },
  {
    name: "Reports",
    permissions: ["reports.export"],
  },
]

/**
 * Who may put a teacher on a class or a subject, and see the teacher directory to do it.
 *
 * `academics.manage` is here because timetabling teachers onto subjects is the Exams
 * Officer's job, and that profile never held `teachers.manage`. `teachers.manage` stays in
 * the list so a school with no exams officer can still have HR or the manager do it.
 * Hiring, editing and removing a teacher need `teachers.manage` alone: employment belongs
 * to HR.
 */
export const TEACHER_ASSIGNMENT_PERMISSIONS: readonly PermissionKey[] = [
  "teachers.manage",
  "academics.manage",
]

const ALL_PERMISSIONS = new Set<PermissionKey>(PERMISSIONS)

export const SYSTEM_PERMISSION_PROFILES: Record<
  string,
  { name: string; permissions: PermissionKey[] }
> = {
  MANAGER: {
    name: "School Manager",
    permissions: [...PERMISSIONS],
  },
  EXAMS: {
    name: "Exams Officer",
    permissions: [
      "academics.manage",
      "compiler.enter_scores",
      "compiler.review_results",
      "compiler.publish_results",
      "compiler.lock_results",
      "compiler.configure_policy",
      "reports.export",
    ],
  },
  /**
   * What a bursar actually does.
   *
   * Money in, money out, and the payroll run - but never their own approval. The
   * expenditure and payroll modules are built around that split, and the integration
   * suites state it outright: "lets an accountant record but not approve", and "lets an
   * accountant generate and pay, but never approve or change a salary". So this grants
   * `expenditure.manage` without `expenditure.approve`, and `payroll.pay` without
   * `payroll.manage`.
   *
   * Those two were missing, which left an accountant looking at expenditure and payroll
   * menus in their own sidebar and being refused by every one of them.
   *
   * `finance.setup` is deliberately absent. It carries fee schedules, discounts and
   * exemptions - waiving what a family owes - and the management of finance logins. A
   * bursar who takes cash and can also exempt the charge it paid is the one combination
   * segregation of duties exists to prevent. The accountant dashboard, sidebar and Finance
   * Staff screen were all written on that assumption ("configuring fee schedules is the
   * admin's job"); this profile granting it quietly made every one of them untrue.
   */
  FINANCE: {
    name: "Finance Officer",
    permissions: [
      "finance.collect_payments",
      "finance.view_reports",
      "expenditure.manage",
      "payroll.pay",
      "reports.export",
    ],
  },
  /**
   * Employment runs through HR: hiring a teacher creates their login and their staff
   * record in one step, so the officer who owns staff records also holds
   * `teachers.manage`. Assigning a hired teacher to classes and subjects is the Exams
   * Officer's job through `academics.manage`; `teachers.manage` still allows it (see
   * TEACHER_ASSIGNMENT_PERMISSIONS) so a school with no exams officer is not stuck.
   */
  HR: {
    name: "HR and Payroll Officer",
    permissions: ["teachers.manage", "payroll.manage", "payroll.pay", "reports.export"],
  },
}

export function normalizePermissions(values: readonly string[]): PermissionKey[] {
  return [...new Set(values)].filter((value): value is PermissionKey =>
    ALL_PERMISSIONS.has(value as PermissionKey),
  )
}

export function basePermissionsForRole(role: Role): PermissionKey[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [...PERMISSIONS]
    case "ADMIN":
      return SYSTEM_PERMISSION_PROFILES.MANAGER.permissions
    case "ACCOUNTANT":
      return SYSTEM_PERMISSION_PROFILES.FINANCE.permissions
    case "TEACHER":
      return ["compiler.enter_scores"]
    case "PARENT":
    case "STUDENT":
      return []
    default:
      return []
  }
}

export function resolveEffectivePermissions(
  role: Role,
  profiles: readonly PermissionProfileInput[] = [],
): Set<PermissionKey> {
  const permissions = new Set(basePermissionsForRole(role))

  for (const profile of profiles) {
    if (profile.isActive === false) continue
    for (const permission of normalizePermissions(profile.permissions)) {
      permissions.add(permission)
    }
  }

  return permissions
}

export function hasPermission(
  role: Role,
  permission: PermissionKey,
  profiles: readonly PermissionProfileInput[] = [],
): boolean {
  return resolveEffectivePermissions(role, profiles).has(permission)
}
