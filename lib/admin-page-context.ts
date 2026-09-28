import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/authz"
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions"
import { redirect } from "next/navigation"

/**
 * Any office permission opens the admin area; each page then asks for its own.
 *
 * Derived from the catalogue rather than listed. The hand-kept list had drifted two keys
 * behind it - `compiler.configure_policy` and `reports.export` - so a profile holding only
 * the promotion-policy key was turned away at the door of the one page that asks for
 * exactly that key.
 */
export const ADMIN_AREA_PERMISSIONS: PermissionKey[] = [...PERMISSIONS]

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
