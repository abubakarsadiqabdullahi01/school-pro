"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"
import { canDeleteSubject, canUseSubjectCode, canUseSubjectName } from "@/lib/subject-rules"
import { canAssignInTerm } from "@/lib/term-rules"

// Create a new subject
export async function createSubject({
  name,
  code,
  schoolId,
}: {
  name: string
  code: string
  schoolId: string
}) {
  // Verify the current user is authorized to create subjects
  const actor = await requirePermission("academics.manage")

  try {
    // If admin, verify they are creating a subject for their assigned school
    assertSchoolAccess(actor, schoolId)

    // The code was already guarded; the name was not, so "Mathematics/MTH" and
    // "Mathematics/MAT" could both exist. Both are compared trimmed and case-insensitively,
    // which a `findFirst` on the raw string was not doing.
    const siblings = await prisma.subject.findMany({
      where: { schoolId },
      select: { name: true, code: true },
    })

    const codeVerdict = canUseSubjectCode(
      code,
      siblings.map((sibling) => sibling.code),
    )
    if (!codeVerdict.allowed) {
      throw new Error(codeVerdict.reason)
    }

    const nameVerdict = canUseSubjectName(
      name,
      siblings.map((sibling) => sibling.name),
    )
    if (!nameVerdict.allowed) {
      throw new Error(nameVerdict.reason)
    }

    // Create the subject
    const newSubject = await prisma.subject.create({
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        schoolId,
      },
    })

    revalidatePath("/dashboard/admin/subjects")
    return { success: true, subjectId: newSubject.id }
  } catch (error) {
    console.error("Failed to create subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to create subject")
    }
    throw new Error("Failed to create subject")
  }
}

// Update an existing subject
export async function updateSubject({
  id,
  name,
  code,
}: {
  id: string
  name: string
  code: string
}) {
  // Verify the current user is authorized to update subjects
  const actor = await requirePermission("academics.manage")

  try {
    // Get the subject to update
    const subjectToUpdate = await prisma.subject.findUnique({
      where: { id },
      select: { id: true, schoolId: true, code: true, name: true },
    })

    if (!subjectToUpdate) {
      throw new Error("Subject not found")
    }

    // If admin, verify they are updating a subject for their assigned school
    assertSchoolAccess(actor, subjectToUpdate.schoolId)

    const siblings = await prisma.subject.findMany({
      where: { schoolId: subjectToUpdate.schoolId, id: { not: id } },
      select: { name: true, code: true },
    })

    const codeVerdict = canUseSubjectCode(
      code,
      siblings.map((sibling) => sibling.code),
      subjectToUpdate.code,
    )
    if (!codeVerdict.allowed) {
      throw new Error(codeVerdict.reason)
    }

    const nameVerdict = canUseSubjectName(
      name,
      siblings.map((sibling) => sibling.name),
      subjectToUpdate.name,
    )
    if (!nameVerdict.allowed) {
      throw new Error(nameVerdict.reason)
    }

    // Update the subject
    await prisma.subject.update({
      where: { id },
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
      },
    })

    revalidatePath("/dashboard/admin/subjects")
    revalidatePath(`/dashboard/admin/subjects/${id}`)
    return { success: true }
  } catch (error) {
    console.error("Failed to update subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to update subject")
    }
    throw new Error("Failed to update subject")
  }
}

// Delete a subject
export async function deleteSubject(id: string) {
  // Verify the current user is authorized to delete subjects
  const actor = await requirePermission("academics.manage")

  try {
    // Check if subject exists
    const subjectToDelete = await prisma.subject.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        classSubjects: { select: { id: true } },
        teacherSubjects: { select: { id: true } },
      },
    })

    if (!subjectToDelete) {
      throw new Error("Subject not found")
    }

    // If admin, verify they are deleting a subject for their assigned school
    assertSchoolAccess(actor, subjectToDelete.schoolId)

    // `classSubjects` is the timetable and says nothing about marks already recorded. A
    // subject dropped from the curriculum has no class assignment and still holds every
    // score ever entered against it — and assessments.subjectId is CASCADE. Both are
    // checked before anything is deleted.
    const recordedScores = await prisma.assessment.count({ where: { subjectId: id } })

    const verdict = canDeleteSubject({
      classAssignments: subjectToDelete.classSubjects.length,
      recordedScores,
    })
    if (!verdict.allowed) {
      throw new Error(`Cannot delete this subject: ${verdict.reason}`)
    }

    // One transaction, so a failure part-way cannot strip the teacher assignments and leave
    // the subject standing.
    await prisma.$transaction(async (tx) => {
      await tx.teacherSubject.deleteMany({ where: { subjectId: id } })
      await tx.subject.delete({ where: { id } })
    })

    revalidatePath("/dashboard/admin/subjects")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete subject:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to delete subject")
    }
    throw new Error("Failed to delete subject")
  }
}

/**
 * Set which teachers teach a subject **in the current term**.
 *
 * A `TeacherSubject` row is per term, so this is a term's timetable, not a standing fact
 * about a teacher. The previous version read the subject's assignments across *every* term
 * and then wrote against the current one, which broke it in both directions:
 *
 *  - Adding was silently skipped for anyone who had ever taught the subject before, because
 *    their old term's row made them look "already assigned".
 *  - Removing had no `termId` filter at all, so unticking a teacher deleted their
 *    assignment for every term in the school's history. With three terms seeded, each
 *    removal was three times wider than the screen implied.
 */
export async function assignTeachersToSubject({
  subjectId,
  teacherIds,
}: {
  subjectId: string
  teacherIds: string[]
}) {
  const actor = await requirePermission("academics.manage")

  try {
    const subjectData = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, schoolId: true },
    })

    if (!subjectData) {
      throw new Error("Subject not found")
    }

    assertSchoolAccess(actor, subjectData.schoolId)

    // The term's own flag is what makes it current; the session's flag is a separate thing
    // and requiring both here meant this screen alone refused to work whenever they
    // disagreed. Every other lookup in the app asks only for the term.
    const currentTerm = await prisma.term.findFirst({
      where: { isCurrent: true, session: { schoolId: subjectData.schoolId } },
      select: { id: true, name: true, endDate: true, isCurrent: true },
    })

    if (!currentTerm) {
      throw new Error("This school has no current term, so there is nothing to assign teachers for.")
    }

    // The rule the teacher-side screens already enforce. A term still flagged current after
    // its end date is a closed term, and this screen deletes assignments as well as adding
    // them - so without it, unticking a teacher rewrote who taught a finished term.
    const termVerdict = canAssignInTerm(currentTerm, actor.role)
    if (!termVerdict.allowed) {
      throw new Error(`${currentTerm.name}: ${termVerdict.reason}`)
    }

    // Scoped to the current term, which is the list the screen is actually showing.
    const existing = await prisma.teacherSubject.findMany({
      where: { subjectId, termId: currentTerm.id },
      select: { teacherId: true },
    })
    const currentTeacherIds = existing.map((row) => row.teacherId)

    const teachersToRemove = currentTeacherIds.filter((id) => !teacherIds.includes(id))
    const teachersToAdd = teacherIds.filter((id) => !currentTeacherIds.includes(id))

    // Validated in one query before the transaction opens, rather than a findUnique per
    // teacher inside it.
    if (teachersToAdd.length > 0) {
      const teachers = await prisma.teacher.findMany({
        where: { id: { in: teachersToAdd } },
        select: { id: true, schoolId: true, user: { select: { isActive: true, firstName: true, lastName: true } } },
      })

      if (teachers.length !== teachersToAdd.length) {
        throw new Error("One of the selected teachers no longer exists.")
      }

      if (teachers.some((teacher) => teacher.schoolId !== subjectData.schoolId)) {
        throw new Error("A selected teacher does not belong to this school.")
      }

      const departed = teachers.find((teacher) => !teacher.user.isActive)
      if (departed) {
        throw new Error(`${departed.user.firstName} ${departed.user.lastName} can no longer sign in, so cannot be given a subject.`)
      }
    }

    await prisma.$transaction(async (tx) => {
      if (teachersToRemove.length > 0) {
        await tx.teacherSubject.deleteMany({
          where: {
            subjectId,
            termId: currentTerm.id,
            teacherId: { in: teachersToRemove },
          },
        })
      }

      if (teachersToAdd.length > 0) {
        await tx.teacherSubject.createMany({
          data: teachersToAdd.map((teacherId) => ({
            subjectId,
            teacherId,
            termId: currentTerm.id,
          })),
          skipDuplicates: true,
        })
      }
    })

    revalidatePath("/dashboard/admin/subjects")
    revalidatePath(`/dashboard/admin/subjects/${subjectId}`)
    revalidatePath(`/dashboard/admin/subjects/${subjectId}/assign-teachers`)
    return { success: true, termName: currentTerm.name }
  } catch (error) {
    console.error("Failed to assign teachers:", error)
    if (error instanceof Error) {
      throw new Error(error.message || "Failed to assign teachers")
    }
    throw new Error("Failed to assign teachers")
  }
}
