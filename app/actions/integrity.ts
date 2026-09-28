"use server"

import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { runIntegrityChecks } from "@/lib/integrity-checks"
import { getActiveSchool } from "@/lib/school-context.server"

async function integritySchool() {
  const actor = await requirePermission("school.manage")
  if (actor.schoolId) return { actor, schoolId: actor.schoolId }
  const school = await getActiveSchool()
  if (!school) throw new Error("Select a school before running integrity checks")
  return { actor, schoolId: school.id }
}

export async function runSchoolIntegrityCheck() {
  try {
    const { actor, schoolId } = await integritySchool()
    const report = await runIntegrityChecks(schoolId, actor.userId)
    revalidatePath("/dashboard/admin/integrity")
    return { success: true as const, data: report }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Integrity check failed" }
  }
}

export async function getSchoolIntegrityChecks() {
  try {
    const { schoolId } = await integritySchool()
    const checks = await prisma.dataIntegrityCheck.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        issuesFound: true,
        results: true,
        createdAt: true,
        completedAt: true,
        runByUser: { select: { firstName: true, lastName: true } },
      },
    })
    return { success: true as const, data: checks }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Could not load integrity checks" }
  }
}
