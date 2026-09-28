"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"
import type { ClassLevel } from "@prisma/client"
import { canChangeClassLevel, canDeleteClass, canUseClassName } from "@/lib/class-rules"

// Create a new class
export async function createClass({
  name,
  level,
  schoolId,
}: {
  name: string
  level: ClassLevel
  schoolId: string
}) {
  // Verify the current user is authorized to create classes
  const actor = await requirePermission("academics.manage")

  try {
    // If admin, verify they are creating a class for their assigned school
    assertSchoolAccess(actor, schoolId)

    // Nothing in the schema stops a school having two classes called "JSS 1A", and once it
    // does, every enrolment and report card afterwards names a class the school cannot tell
    // apart. The form greys the name as you type; this is the same rule at the boundary.
    const siblings = await prisma.class.findMany({
      where: { schoolId },
      select: { name: true },
    })

    const nameVerdict = canUseClassName(
      name,
      siblings.map((sibling) => sibling.name),
    )
    if (!nameVerdict.allowed) {
      throw new Error(nameVerdict.reason)
    }

    // Create the class
    const newClass = await prisma.class.create({
      data: {
        name: name.trim(),
        level,
        schoolId,
      },
    })

    revalidatePath("/dashboard/admin/classes")
    return { success: true, classId: newClass.id }
  } catch (error) {
    console.error("Failed to create class:", error)
    throw new Error("Failed to create class")
  }
}

// Update an existing class
export async function updateClass({
  id,
  name,
  level,
}: {
  id: string
  name: string
  level: ClassLevel
}) {
  // Verify the current user is authorized to update classes
  const actor = await requirePermission("academics.manage")

  try {
    // Get the class to update
    const classToUpdate = await prisma.class.findUnique({
      where: { id },
      select: { id: true, schoolId: true, name: true, level: true },
    })

    if (!classToUpdate) {
      throw new Error("Class not found")
    }

    // If admin, verify they are updating a class for their assigned school
    assertSchoolAccess(actor, classToUpdate.schoolId)

    const siblings = await prisma.class.findMany({
      where: { schoolId: classToUpdate.schoolId, id: { not: id } },
      select: { name: true },
    })

    const nameVerdict = canUseClassName(
      name,
      siblings.map((sibling) => sibling.name),
      classToUpdate.name,
    )
    if (!nameVerdict.allowed) {
      throw new Error(nameVerdict.reason)
    }

    // The section decides how results are graded and how promotion is evaluated, so moving
    // a marked class from Junior to Senior reinterprets results that have already gone out.
    if (level !== classToUpdate.level) {
      const recordedScores = await prisma.assessment.count({
        where: { studentClassTerm: { classTerm: { classId: id } } },
      })
      const levelVerdict = canChangeClassLevel({ recordedScores })
      if (!levelVerdict.allowed) {
        throw new Error(levelVerdict.reason)
      }
    }

    // Update the class
    await prisma.class.update({
      where: { id },
      data: {
        name: name.trim(),
        level,
      },
    })

    revalidatePath("/dashboard/admin/classes")
    revalidatePath(`/dashboard/admin/classes/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Failed to update class:", error)
    throw new Error("Failed to update class")
  }
}

// Delete a class
export async function deleteClass(id: string) {
  // Verify the current user is authorized to delete classes
  const actor = await requirePermission("academics.manage")

  try {
    // Check if class exists
    const classToDelete = await prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        classTerms: { select: { id: true } },
        subjects: { select: { id: true } },
      },
    })

    // Fees now hang off ClassTerm rather than Class, so they are counted through it.
    const feeStructureCount = await prisma.feeStructure.count({
      where: { classTerm: { classId: id } },
    })

    if (!classToDelete) {
      throw new Error("Class not found")
    }

    // If admin, verify they are deleting a class for their assigned school
    assertSchoolAccess(actor, classToDelete.schoolId)

    // A class sits at the top of a cascade that ends at student results:
    //   Class -> ClassTerm -> StudentClassTerm -> Assessment, every link CASCADE.
    // Deleting one also cascades StudentEnrollmentHistory and StudentTransition (both
    // ends), so an unguarded delete took enrolment history, promotion history and every
    // score any student earned in the class. There was no guard at all.
    const [enrolments, recordedScores] = await Promise.all([
      prisma.studentClassTerm.count({ where: { classTerm: { classId: id } } }),
      prisma.assessment.count({ where: { studentClassTerm: { classTerm: { classId: id } } } }),
    ])

    const verdict = canDeleteClass({ enrolments, recordedScores })
    if (!verdict.allowed) {
      throw new Error(`Cannot delete this class: ${verdict.reason}`)
    }

    // One transaction, so a failure part-way cannot leave a class stripped of its terms and
    // subjects but still standing. Fees go first: they hang off ClassTerm, so deleting the
    // class terms would cascade them away and leave this deleteMany matching nothing.
    await prisma.$transaction(async (tx) => {
      if (feeStructureCount > 0) {
        await tx.feeStructure.deleteMany({ where: { classTerm: { classId: id } } })
      }
      await tx.classTerm.deleteMany({ where: { classId: id } })
      await tx.classSubject.deleteMany({ where: { classId: id } })
      await tx.class.delete({ where: { id } })
    })

    revalidatePath("/dashboard/admin/classes")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete class:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to delete class")
  }
}

// `assignSubjectsToClass` used to live here: a class-level "assign subjects" action that
// wrote to whichever term happened to be current, while reading the class's existing
// subjects across *every* term. Anything already taught in an earlier term therefore looked
// "already assigned" and was silently skipped, so a subject could never be brought back
// into the current term. Subjects belong to a ClassTerm, and `assignSubjectsToClassTerm`
// in app/actions/class-term-management.ts is the one place that manages them.
