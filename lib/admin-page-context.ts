import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/authz"
import type { PermissionKey } from "@/lib/permissions"
import { redirect } from "next/navigation"

export const ADMIN_AREA_PERMISSIONS: PermissionKey[] = [
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
  "finance.setup",
  "finance.collect_payments",
  "finance.view_reports",
  "expenditure.manage",
  "expenditure.approve",
  "payroll.manage",
  "payroll.pay",
]

export async function requireAdminSchool(permission: PermissionKey | PermissionKey[] = ADMIN_AREA_PERMISSIONS) {
  const permissions = Array.isArray(permission) ? permission : [permission]
  let actor = null

  for (const requiredPermission of permissions) {
    actor = await requirePermission(requiredPermission).catch(() => null)
    if (actor) break
  }

  if (!actor?.schoolId) {
    redirect("/dashboard")
  }

  const admin = await prisma.admin.findUnique({
    where: { userId: actor.userId },
    select: {
      id: true,
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  const school =
    admin?.school ??
    (await prisma.school.findUnique({
      where: { id: actor.schoolId },
      select: {
        id: true,
        name: true,
        code: true,
      },
    }))

  if (!school) {
    redirect("/dashboard/access-error")
  }

  return {
    actor,
    adminId: admin?.id ?? null,
    school,
    schoolId: school.id,
  }
}
