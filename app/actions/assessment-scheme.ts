"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAdminScope } from "@/lib/authz"
import { recordAudit } from "@/lib/audit"
import {
  DEFAULT_ASSESSMENT_SCHEME,
  schemeTotal,
  validateScheme,
  type AssessmentScheme,
} from "@/lib/assessment-scheme"

/**
 * Reading and editing a school's assessment scheme — how a subject's marks are split
 * between continuous assessment and the exam.
 *
 * The scheme is loaded for validation on every score save, so it is cached; both actions
 * here invalidate the `assessment-scheme` tag so a change takes effect immediately rather
 * than up to an hour later.
 */

export async function getAssessmentScheme() {
  try {
    const actor = await requireAdminScope()

    if (!actor.schoolId) {
      return {
        success: false as const,
        error: "Choose a school before editing its assessment scheme.",
      }
    }

    const scheme = await prisma.assessmentScheme.findUnique({
      where: { schoolId: actor.schoolId },
      select: { name: true, ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
    })

    return { success: true as const, data: scheme ?? DEFAULT_ASSESSMENT_SCHEME }
  } catch (error) {
    console.error("Failed to load assessment scheme:", error)
    return { success: false as const, error: "Could not load the assessment scheme." }
  }
}

export async function updateAssessmentScheme(input: AssessmentScheme) {
  try {
    const actor = await requireAdminScope()

    if (!actor.schoolId) {
      return {
        success: false as const,
        error: "Choose a school before editing its assessment scheme.",
      }
    }

    const scheme: AssessmentScheme = {
      name: input.name.trim(),
      ca1Max: Math.trunc(input.ca1Max),
      ca2Max: Math.trunc(input.ca2Max),
      ca3Max: Math.trunc(input.ca3Max),
      examMax: Math.trunc(input.examMax),
    }

    const problems = validateScheme(scheme)
    if (problems.length > 0) {
      return { success: false as const, error: problems.join(" ") }
    }

    const previous = await prisma.assessmentScheme.findUnique({
      where: { schoolId: actor.schoolId },
      select: { name: true, ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
    })

    await prisma.assessmentScheme.upsert({
      where: { schoolId: actor.schoolId },
      update: scheme,
      create: { schoolId: actor.schoolId, ...scheme },
    })

    // The scheme is read on every score save, so a stale cache would keep rejecting
    // scores the school has just made valid.
    revalidateTag("assessment-scheme", "max")
    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/admin/school-settings/assessment-scheme")

    await recordAudit({
      actor,
      action: "assessment_scheme.update",
      entityType: "AssessmentScheme",
      summary:
        `Changed the assessment scheme to ${scheme.ca1Max}/${scheme.ca2Max}/` +
        `${scheme.ca3Max} CA plus ${scheme.examMax} exam, out of ${schemeTotal(scheme)}`,
      before: previous ?? { ...DEFAULT_ASSESSMENT_SCHEME, note: "implicit default" },
      after: { ...scheme },
    })

    return {
      success: true as const,
      data: scheme,
      message: `Assessment scheme saved. Subjects are now marked out of ${schemeTotal(scheme)}.`,
    }
  } catch (error) {
    console.error("Failed to update assessment scheme:", error)
    return { success: false as const, error: "Could not save the assessment scheme." }
  }
}
