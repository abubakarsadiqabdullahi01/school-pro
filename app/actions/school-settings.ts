"use server"

import { assertSchoolAccess, requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { schemeTotal } from "@/lib/assessment-scheme"
import { revalidatePath } from "next/cache"
import { recordAudit } from "@/lib/audit"
import {
  SCHOOL_SETTINGS_BY_KEY,
  WITHHOLD_RESULTS_KEY,
  serialiseSettingValue,
} from "@/lib/system-config"

async function requireSchoolSettingsAccess(requestedSchoolId?: string) {
  const actor = await requirePermission("school.manage")

  if (!actor.schoolId) {
    throw new Error("School not associated with this account")
  }

  if (requestedSchoolId) {
    assertSchoolAccess(actor, requestedSchoolId)
  }

  return actor.schoolId
}

function assertValidPassMark(passMark: number) {
  if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
    throw new Error("Pass mark must be between 0 and 100")
  }
}

function assertCompleteGradeCoverage(levels: Array<{ minScore: number; maxScore: number }>) {
  for (let score = 0; score <= 100; score += 1) {
    const matches = levels.filter((level) => score >= level.minScore && score <= level.maxScore)
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `The grading bands do not cover score ${score}`
          : `More than one grading band covers score ${score}`,
      )
    }
  }
}

export async function getSchoolSettingsData() {
  try {
    const schoolId = await requireSchoolSettingsAccess()

    const [school, assessmentScheme, gradingSystem, stats, currentSession, currentTerm] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
      }),
      prisma.assessmentScheme.findUnique({
        where: { schoolId },
        select: { name: true, ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
      }),
      prisma.gradingSystem.findFirst({
        where: { schoolId, isDefault: true },
        include: {
          levels: true,
        },
      }),
      Promise.all([
        prisma.student.count({ where: { schoolId } }),
        prisma.teacher.count({ where: { schoolId } }),
        prisma.class.count({ where: { schoolId } }),
      ]),
      prisma.session.findFirst({
        where: { schoolId, isCurrent: true },
      }),
      prisma.term.findFirst({
        where: {
          session: { schoolId },
          isCurrent: true,
        },
      }),
    ])

    if (!school) {
      throw new Error("School not found")
    }

    const [totalStudents, totalTeachers, totalClasses] = stats

    return {
      success: true,
      data: {
        school,
        assessmentScheme: assessmentScheme
          ? { ...assessmentScheme, total: schemeTotal(assessmentScheme) }
          : null,
        gradingSystem: gradingSystem
          ? {
              id: gradingSystem.id,
              name: gradingSystem.name,
              description: gradingSystem.description,
              isDefault: gradingSystem.isDefault,
              passMark: gradingSystem.passMark,
              levelsCount: gradingSystem.levels.length,
            }
          : null,
        stats: {
          totalStudents,
          totalTeachers,
          totalClasses,
          currentSession: currentSession?.name,
          currentTerm: currentTerm?.name,
        },
      },
    }
  } catch (error) {
    console.error("Failed to fetch school settings data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch school settings data",
    }
  }
}

export async function getAdmissionSettingsData() {
  try {
    const schoolId = await requireSchoolSettingsAccess()

    const [school, sequences] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
      }),
      prisma.admissionSequence.findMany({
        where: { schoolId },
        orderBy: { year: "desc" },
      }),
    ])

    if (!school) {
      throw new Error("School not found")
    }

    const currentYear = new Date().getFullYear()
    const currentSequence = sequences.find((seq) => seq.year === currentYear)

    // Generate next admission number
    const nextSequenceNumber = (currentSequence?.lastSequence || 0) + 1
    const paddedNumber = nextSequenceNumber.toString().padStart(4, "0")

    const nextAdmissionNumber = school.admissionFormat
      .replace("{PREFIX}", school.admissionPrefix)
      .replace("{YEAR}", currentYear.toString())
      .replace("{NUMBER}", paddedNumber)

    return {
      success: true,
      data: {
        school,
        sequences,
        currentYear,
        nextAdmissionNumber,
      },
    }
  } catch (error) {
    console.error("Failed to fetch admission settings data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch admission settings data",
    }
  }
}

export async function updateAdmissionSettings({
  schoolId,
  admissionPrefix,
  admissionFormat,
  admissionSequenceStart,
}: {
  schoolId: string
  admissionPrefix: string
  admissionFormat: string
  admissionSequenceStart: number
}) {
  try {
    await requireSchoolSettingsAccess(schoolId)

    await prisma.school.update({
      where: { id: schoolId },
      data: {
        admissionPrefix,
        admissionFormat,
        admissionSequenceStart,
      },
    })

    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/admin/school-settings/admission")

    return { success: true }
  } catch (error) {
    console.error("Failed to update admission settings:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to update admission settings")
  }
}

export async function generateNextAdmissionNumber({
  schoolId,
  prefix,
  format,
  year,
}: {
  schoolId: string
  prefix: string
  format: string
  year: number
}) {
  try {
    await requireSchoolSettingsAccess(schoolId)

    // Get current sequence for the year
    const sequence = await prisma.admissionSequence.findUnique({
      where: {
        schoolId_year: {
          schoolId,
          year,
        },
      },
    })

    const nextSequenceNumber = (sequence?.lastSequence || 0) + 1
    const paddedNumber = nextSequenceNumber.toString().padStart(4, "0")

    const admissionNumber = format
      .replace("{PREFIX}", prefix)
      .replace("{YEAR}", year.toString())
      .replace("{NUMBER}", paddedNumber)

    return {
      success: true,
      admissionNumber,
    }
  } catch (error) {
    console.error("Failed to generate admission number:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate admission number",
    }
  }
}

export async function createAdmissionNumber({
  schoolId,
  year,
}: {
  schoolId: string
  year?: number
}) {
  try {
    await requireSchoolSettingsAccess(schoolId)

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    })

    if (!school) {
      throw new Error("School not found")
    }

    const currentYear = year || new Date().getFullYear()

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get or create admission sequence for the year
      let sequence = await tx.admissionSequence.findUnique({
        where: {
          schoolId_year: {
            schoolId,
            year: currentYear,
          },
        },
      })

      if (!sequence) {
        sequence = await tx.admissionSequence.create({
          data: {
            schoolId,
            year: currentYear,
            lastSequence: school.admissionSequenceStart,
          },
        })
      } else {
        // Increment the sequence
        sequence = await tx.admissionSequence.update({
          where: { id: sequence.id },
          data: {
            lastSequence: sequence.lastSequence + 1,
          },
        })
      }

      // Generate the admission number
      const paddedNumber = sequence.lastSequence.toString().padStart(4, "0")
      const admissionNumber = school.admissionFormat
        .replace("{PREFIX}", school.admissionPrefix)
        .replace("{YEAR}", currentYear.toString())
        .replace("{NUMBER}", paddedNumber)

      return {
        admissionNumber,
        sequence: sequence.lastSequence,
        year: currentYear,
      }
    })

    return {
      success: true,
      ...result,
    }
  } catch (error) {
    console.error("Failed to create admission number:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to create admission number")
  }
}

export async function getSchoolInformationData() {
  try {
    const schoolId = await requireSchoolSettingsAccess()

    const [school, stats] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
      }),
      Promise.all([
        prisma.student.count({ where: { schoolId } }),
        prisma.teacher.count({ where: { schoolId } }),
        prisma.class.count({ where: { schoolId } }),
        prisma.session.count({ where: { schoolId } }),
      ]),
    ])

    if (!school) {
      throw new Error("School not found")
    }

    const [totalStudents, totalTeachers, totalClasses, totalSessions] = stats

    return {
      success: true,
      data: {
        school,
        canEditCode: false, // Only super admin can edit school code
        stats: {
          totalStudents,
          totalTeachers,
          totalClasses,
          totalSessions,
        },
      },
    }
  } catch (error) {
    console.error("Failed to fetch school information data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch school information data",
    }
  }
}

export async function updateSchoolInformation({
  schoolId,
  address,
  phone,
  email,
  website,
}: {
  schoolId: string
  address: string
  phone: string
  email: string
  website?: string
}) {
  try {
    await requireSchoolSettingsAccess(schoolId)

    // Admin can ONLY update these specific fields - no other fields allowed
    await prisma.school.update({
      where: { id: schoolId },
      data: {
        address,
        phone,
        email,
        website: website || null,
        // Explicitly NOT allowing: name, code, isActive, createdAt, etc.
        // logoUrl is handled separately via upload API
      },
    })

    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/admin/school-settings/information")

    return { success: true }
  } catch (error) {
    console.error("Failed to update school information:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to update school information")
  }
}

// Create a new grading system
export async function createGradingSystem({
  schoolId,
  name,
  description,
  passMark,
}: {
  schoolId: string
  name: string
  description?: string
  passMark: number
}) {
  try {
    await requireSchoolSettingsAccess(schoolId)
    assertValidPassMark(passMark)

    // Check if there are any existing grading systems for this school
    const existingCount = await prisma.gradingSystem.count({
      where: { schoolId },
    })

    // Create the grading system
    const gradingSystem = await prisma.gradingSystem.create({
      data: {
        schoolId,
        name,
        description,
        passMark,
        isDefault: existingCount === 0, // Make it default if it's the first one
      },
      include: {
        levels: true,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: gradingSystem }
  } catch (error) {
    console.error("Failed to create grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to create grading system" }
  }
}

// Update a grading system
export async function updateGradingSystem({
  id,
  name,
  description,
  passMark,
}: {
  id: string
  name: string
  description?: string
  passMark: number
}) {
  try {
    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    await requireSchoolSettingsAccess(gradingSystem.schoolId)
    assertValidPassMark(passMark)

    // Update the grading system
    const updatedGradingSystem = await prisma.gradingSystem.update({
      where: { id },
      data: {
        name,
        description,
        passMark,
      },
      include: {
        levels: true,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: updatedGradingSystem }
  } catch (error) {
    console.error("Failed to update grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to update grading system" }
  }
}

// Delete a grading system
export async function deleteGradingSystem({ id }: { id: string }) {
  try {
    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true, isDefault: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    await requireSchoolSettingsAccess(gradingSystem.schoolId)

    // Cannot delete the default grading system
    if (gradingSystem.isDefault) {
      throw new Error("Cannot delete the default grading system")
    }

    // Delete all grade levels first
    await prisma.gradeLevel.deleteMany({
      where: { gradingSystemId: id },
    })

    // Delete the grading system
    await prisma.gradingSystem.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete grading system" }
  }
}

// Set a grading system as default
export async function setDefaultGradingSystem({ id, schoolId }: { id: string; schoolId: string }) {
  try {
    await requireSchoolSettingsAccess(schoolId)

    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id },
      select: { schoolId: true, levels: { select: { minScore: true, maxScore: true } } },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    if (gradingSystem.schoolId !== schoolId) {
      throw new Error("Grading system not found for this school")
    }
    if (gradingSystem.levels.length === 0) throw new Error("Add grading bands before making this system the default")
    assertCompleteGradeCoverage(gradingSystem.levels)

    // Scope the reset to the school on the record that was just verified, not to the
    // schoolId the caller passed. Using the parameter let an admin pair a legitimate id of
    // their own with another school's id and clear that school's default — leaving it with
    // none, which makes every result there fall back to the built-in scale.
    await prisma.$transaction(async (tx) => {
      await tx.gradingSystem.updateMany({
        where: { schoolId: gradingSystem.schoolId },
        data: { isDefault: false },
      })
      await tx.gradingSystem.update({ where: { id }, data: { isDefault: true } })
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to set default grading system:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to set default grading system" }
  }
}

// Add a grade level to a grading system
export async function addGradeLevel({
  gradingSystemId,
  minScore,
  maxScore,
  grade,
  remark,
}: {
  gradingSystemId: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
}) {
  try {
    // Get the grading system to verify it belongs to the admin's school
    const gradingSystem = await prisma.gradingSystem.findUnique({
      where: { id: gradingSystemId },
      select: { schoolId: true },
    })

    if (!gradingSystem) {
      throw new Error("Grading system not found")
    }

    await requireSchoolSettingsAccess(gradingSystem.schoolId)

    // Validate score range
    if (minScore < 0 || minScore > 100 || maxScore < 0 || maxScore > 100) {
      throw new Error("Score must be between 0 and 100")
    }

    if (minScore > maxScore) {
      throw new Error("Minimum score cannot be greater than maximum score")
    }

    // Check if grade already exists for this grading system
    const existingGrade = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId,
        grade,
      },
    })

    if (existingGrade) {
      throw new Error(`Grade "${grade}" already exists in this grading system`)
    }

    // Bands must not overlap. Two bands covering the same score leave the result to
    // whichever the ordering happens to surface first (loadGradingSystem sorts by minScore
    // descending), so a mark silently lands in a band nobody chose.
    const overlapping = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId,
        minScore: { lte: maxScore },
        maxScore: { gte: minScore },
      },
      select: { grade: true, minScore: true, maxScore: true },
    })

    if (overlapping) {
      throw new Error(
        `Scores ${minScore}-${maxScore} overlap grade "${overlapping.grade}" (${overlapping.minScore}-${overlapping.maxScore})`,
      )
    }

    // Create the grade level
    const gradeLevel = await prisma.gradeLevel.create({
      data: {
        gradingSystemId,
        minScore,
        maxScore,
        grade,
        remark,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: gradeLevel }
  } catch (error) {
    console.error("Failed to add grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to add grade level" }
  }
}

// Update a grade level
export async function updateGradeLevel({
  id,
  minScore,
  maxScore,
  grade,
  remark,
}: {
  id: string
  minScore: number
  maxScore: number
  grade: string
  remark: string
}) {
  try {
    // Get the grade level to verify it belongs to the admin's school
    const gradeLevel = await prisma.gradeLevel.findUnique({
      where: { id },
      include: {
        gradingSystem: {
          select: {
            schoolId: true,
            isDefault: true,
            levels: { select: { id: true, minScore: true, maxScore: true } },
          },
        },
      },
    })

    if (!gradeLevel) {
      throw new Error("Grade level not found")
    }

    await requireSchoolSettingsAccess(gradeLevel.gradingSystem.schoolId)

    // Validate score range
    if (minScore < 0 || minScore > 100 || maxScore < 0 || maxScore > 100) {
      throw new Error("Score must be between 0 and 100")
    }

    if (minScore > maxScore) {
      throw new Error("Minimum score cannot be greater than maximum score")
    }

    // Check if grade already exists for this grading system (excluding this grade level)
    const existingGrade = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId: gradeLevel.gradingSystemId,
        grade,
        id: { not: id },
      },
    })

    if (existingGrade) {
      throw new Error(`Grade "${grade}" already exists in this grading system`)
    }

    // Same overlap rule as addGradeLevel, excluding the band being edited.
    const overlapping = await prisma.gradeLevel.findFirst({
      where: {
        gradingSystemId: gradeLevel.gradingSystemId,
        id: { not: id },
        minScore: { lte: maxScore },
        maxScore: { gte: minScore },
      },
      select: { grade: true, minScore: true, maxScore: true },
    })

    if (overlapping) {
      throw new Error(
        `Scores ${minScore}-${maxScore} overlap grade "${overlapping.grade}" (${overlapping.minScore}-${overlapping.maxScore})`,
      )
    }
    if (gradeLevel.gradingSystem.isDefault) {
      assertCompleteGradeCoverage(
        gradeLevel.gradingSystem.levels.map((level) =>
          level.id === id ? { minScore, maxScore } : level,
        ),
      )
    }

    // Update the grade level
    const updatedGradeLevel = await prisma.gradeLevel.update({
      where: { id },
      data: {
        minScore,
        maxScore,
        grade,
        remark,
      },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true, data: updatedGradeLevel }
  } catch (error) {
    console.error("Failed to update grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to update grade level" }
  }
}

// Delete a grade level
export async function deleteGradeLevel({ id }: { id: string }) {
  try {
    // Get the grade level to verify it belongs to the admin's school
    const gradeLevel = await prisma.gradeLevel.findUnique({
      where: { id },
      include: {
        gradingSystem: {
          select: { schoolId: true, isDefault: true },
        },
      },
    })

    if (!gradeLevel) {
      throw new Error("Grade level not found")
    }

    await requireSchoolSettingsAccess(gradeLevel.gradingSystem.schoolId)
    if (gradeLevel.gradingSystem.isDefault) {
      throw new Error("A grade band cannot be removed from the active grading system")
    }

    // Delete the grade level
    await prisma.gradeLevel.delete({
      where: { id },
    })

    revalidatePath("/dashboard/admin/settings/grading-systems")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete grade level:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete grade level" }
  }
}

// ============================================
// RESULTS POLICY
// ============================================

/**
 * Whether this school holds a term's results while that term's fees are unpaid.
 *
 * Kept as a school setting rather than a product rule because schools genuinely differ:
 * some consider withholding the only leverage they have, others consider it unfair to
 * punish a child for a parent's arrears. Neither is the software's decision.
 */
export async function getResultsPolicy() {
  try {
    const schoolId = await requireSchoolSettingsAccess()

    const row = await prisma.systemConfiguration.findFirst({
      where: { schoolId, configKey: WITHHOLD_RESULTS_KEY },
      select: { configValue: true, isActive: true },
    })

    return {
      success: true as const,
      data: { withholdResultsWhenOwing: row?.isActive === true && row.configValue === "true" },
    }
  } catch (error) {
    console.error("Error reading the results policy:", error)
    return { success: false as const, error: "Failed to load the results policy" }
  }
}

export async function updateResultsPolicy(withhold: boolean) {
  try {
    const actor = await requirePermission("school.manage")
    if (!actor.schoolId) return { success: false as const, error: "No school on this account" }
    const schoolId = actor.schoolId

    if (typeof withhold !== "boolean") {
      return { success: false as const, error: "That is not a yes or no answer." }
    }

    const definition = SCHOOL_SETTINGS_BY_KEY.get(WITHHOLD_RESULTS_KEY)!
    const serialised = serialiseSettingValue(definition, withhold)
    if (!serialised.ok) return { success: false as const, error: serialised.error }

    // findFirst-then-write rather than upsert, for the reason system-config.ts explains:
    // the unique key includes a nullable schoolId and MySQL does not collide NULLs.
    const existing = await prisma.systemConfiguration.findFirst({
      where: { schoolId, configKey: WITHHOLD_RESULTS_KEY },
      select: { id: true, configValue: true },
    })

    if (existing) {
      await prisma.systemConfiguration.update({
        where: { id: existing.id },
        data: { configValue: serialised.value, isActive: true, description: definition.description },
      })
    } else {
      await prisma.systemConfiguration.create({
        data: {
          schoolId,
          configKey: WITHHOLD_RESULTS_KEY,
          configValue: serialised.value,
          configType: definition.type,
          description: definition.description,
          isActive: true,
        },
      })
    }

    await recordAudit({
      actor,
      action: "school_settings.results_policy",
      entityType: "SystemConfiguration",
      entityId: existing?.id ?? null,
      schoolId,
      summary: withhold
        ? "Results are now held from parents and students while that term's fees are unpaid"
        : "Results are now shown regardless of unpaid fees",
      before: { withholdResultsWhenOwing: existing?.configValue ?? "false" },
      after: { withholdResultsWhenOwing: serialised.value },
    })

    revalidatePath("/dashboard/admin/school-settings")
    revalidatePath("/dashboard/parent", "layout")
    revalidatePath("/dashboard/student", "layout")

    return {
      success: true as const,
      message: withhold
        ? "Results will be held while a term's fees are unpaid."
        : "Results will be shown regardless of unpaid fees.",
    }
  } catch (error) {
    console.error("Error updating the results policy:", error)
    return { success: false as const, error: "Failed to save the results policy" }
  }
}
