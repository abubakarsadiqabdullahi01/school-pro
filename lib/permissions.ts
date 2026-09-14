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
  "teachers.manage": "Manage teachers",
  "parents.manage": "Manage parents",
  "academics.manage": "Manage academic setup",
  "compiler.enter_scores": "Enter compiler scores",
  "compiler.review_results": "Review results",
  "compiler.publish_results": "Publish or withdraw results",
  "compiler.lock_results": "Lock results",
  "compiler.configure_policy": "Configure promotion policy",
  "finance.setup": "Configure finance",
  "finance.collect_payments": "Collect payments",
  "finance.view_reports": "View finance reports",
  "expenditure.manage": "Manage expenditure",
  "expenditure.approve": "Approve expenditure",
  "payroll.manage": "Manage payroll setup",
  "payroll.pay": "Run and pay payroll",
  "reports.export": "Export reports",
}

export const PERMISSION_GROUPS: Array<{ name: string; permissions: PermissionKey[] }> = [
  {
    name: "Administration",
    permissions: [
      "school.manage",
      "users.manage",
      "students.manage",
      "teachers.manage",
      "parents.manage",
      "academics.manage",
    ],
  },
  {
    name: "Compiler",
    permissions: [
      "compiler.enter_scores",
      "compiler.review_results",
      "compiler.publish_results",
      "compiler.lock_results",
      "compiler.configure_policy",
    ],
  },
  {
    name: "Money",
    permissions: [
      "finance.setup",
      "finance.collect_payments",
      "finance.view_reports",
      "expenditure.manage",
      "expenditure.approve",
      "payroll.manage",
      "payroll.pay",
    ],
  },
  {
    name: "Reports",
    permissions: ["reports.export"],
  },
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
  FINANCE: {
    name: "Finance Officer",
    permissions: ["finance.setup", "finance.collect_payments", "finance.view_reports", "reports.export"],
  },
  HR: {
    name: "HR and Payroll Officer",
    permissions: ["payroll.manage", "payroll.pay", "reports.export"],
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
