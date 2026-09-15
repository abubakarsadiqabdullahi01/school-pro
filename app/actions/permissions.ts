"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/authz"
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS,
  normalizePermissions,
  SYSTEM_PERMISSION_PROFILES,
  type PermissionKey,
} from "@/lib/permissions"

const profileSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: z.array(z.string()).min(1),
})

export async function ensureSystemPermissionProfiles() {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before setting permission profiles")

    await prisma.$transaction(
      Object.entries(SYSTEM_PERMISSION_PROFILES).map(([code, profile]) =>
        prisma.permissionProfile.upsert({
          where: { schoolId_code: { schoolId: actor.schoolId!, code } },
          create: {
            schoolId: actor.schoolId!,
            code,
            name: profile.name,
            permissions: profile.permissions,
            isSystem: true,
          },
          update: {
            name: profile.name,
            permissions: profile.permissions,
            isSystem: true,
            isActive: true,
          },
        }),
      ),
    )

    revalidatePath("/dashboard/admin/users")
    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/admin/permissions")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not create system permission profiles",
    }
  }
}

export async function getPermissionProfiles() {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before reading permission profiles")

    const profiles = await prisma.permissionProfile.findMany({
      where: { schoolId: actor.schoolId },
      include: {
        _count: {
          select: { assignments: { where: { isActive: true } } },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    })

    return {
      success: true,
      data: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        code: profile.code,
        description: profile.description,
        permissions: normalizePermissions(
          Array.isArray(profile.permissions) ? profile.permissions.map(String) : [],
        ),
        isSystem: profile.isSystem,
        isActive: profile.isActive,
        activeAssignments: profile._count.assignments,
      })),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load permission profiles",
    }
  }
}

export async function getPermissionManagementData() {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before managing permissions")

    await ensureSystemPermissionProfiles()

    const [profiles, users] = await Promise.all([
      prisma.permissionProfile.findMany({
        where: { schoolId: actor.schoolId },
        include: {
          _count: {
            select: { assignments: { where: { isActive: true } } },
          },
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      }),
      prisma.user.findMany({
        // Staff only. Permission profiles grant office duties — compiling results,
        // recording payments, running payroll — and a student or parent has no
        // business in that list. Including them also meant loading the entire
        // school roll on every visit to this page, thousands of rows to pick one
        // person out of.
        where: {
          isActive: true,
          OR: [
            { admin: { schoolId: actor.schoolId } },
            { teacher: { schoolId: actor.schoolId } },
            { staffRecord: { schoolId: actor.schoolId } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          teacher: { select: { id: true } },
          staffRecord: { select: { staffNo: true, jobTitle: true, department: true } },
          permissionProfiles: {
            where: { schoolId: actor.schoolId },
            select: {
              isActive: true,
              assignedAt: true,
              profile: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  permissions: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      }),
    ])

    return {
      success: true,
      data: {
        permissionGroups: PERMISSION_GROUPS,
        permissionLabels: PERMISSION_LABELS,
        permissions: PERMISSIONS,
        profiles: profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          code: profile.code,
          description: profile.description,
          permissions: normalizePermissions(
            Array.isArray(profile.permissions) ? profile.permissions.map(String) : [],
          ),
          isSystem: profile.isSystem,
          isActive: profile.isActive,
          activeAssignments: profile._count.assignments,
        })),
        users: users.map((user) => ({
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          // What this person does, for telling two staff of the same login role
          // apart in the list. Falls back to the login role when nobody has
          // filled in an HR record.
          jobTitle: user.staffRecord?.jobTitle ?? (user.teacher ? "Teacher" : null),
          staffNo: user.staffRecord?.staffNo ?? null,
          department: user.staffRecord?.department ?? null,
          profiles: user.permissionProfiles
            .filter((assignment) => assignment.isActive && assignment.profile.isActive)
            .map((assignment) => ({
              id: assignment.profile.id,
              name: assignment.profile.name,
              code: assignment.profile.code,
              assignedAt: assignment.assignedAt,
              permissions: normalizePermissions(
                Array.isArray(assignment.profile.permissions)
                  ? assignment.profile.permissions.map(String)
                  : [],
              ),
            })),
        })),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load permission management",
    }
  }
}

export async function createPermissionProfile(input: unknown) {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before creating permission profiles")

    const parsed = profileSchema.parse(input)
    const permissions = normalizePermissions(parsed.permissions)
    if (permissions.length === 0) throw new Error("Choose at least one valid permission")

    const profile = await prisma.permissionProfile.create({
      data: {
        schoolId: actor.schoolId,
        name: parsed.name,
        code: parsed.code,
        description: parsed.description,
        permissions,
      },
      select: { id: true },
    })

    revalidatePath("/dashboard/admin/users")
    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/admin/permissions")
    return { success: true, data: { id: profile.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not create permission profile",
    }
  }
}

export async function assignPermissionProfile(input: {
  userId: string
  profileId: string
}) {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before assigning permission profiles")

    const profile = await prisma.permissionProfile.findFirst({
      where: { id: input.profileId, schoolId: actor.schoolId, isActive: true },
      select: { id: true },
    })
    if (!profile) throw new Error("Permission profile not found")

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    })
    if (!user) throw new Error("User not found")

    await prisma.userPermissionProfile.upsert({
      where: {
        userId_schoolId_profileId: {
          userId: input.userId,
          schoolId: actor.schoolId,
          profileId: input.profileId,
        },
      },
      create: {
        userId: input.userId,
        schoolId: actor.schoolId,
        profileId: input.profileId,
        assignedBy: actor.userId,
      },
      update: {
        isActive: true,
        revokedAt: null,
        assignedBy: actor.userId,
        assignedAt: new Date(),
      },
    })

    revalidatePath("/dashboard/admin/users")
    revalidatePath("/dashboard/admin/permissions")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not assign permission profile",
    }
  }
}

export async function revokePermissionProfile(input: {
  userId: string
  profileId: string
}) {
  try {
    const actor = await requirePermission("users.manage")
    if (!actor.schoolId) throw new Error("Select a school before revoking permission profiles")

    await prisma.userPermissionProfile.updateMany({
      where: {
        userId: input.userId,
        schoolId: actor.schoolId,
        profileId: input.profileId,
        isActive: true,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    })

    revalidatePath("/dashboard/admin/users")
    revalidatePath("/dashboard/admin/permissions")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not revoke permission profile",
    }
  }
}
