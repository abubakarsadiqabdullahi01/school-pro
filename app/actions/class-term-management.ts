"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"
import { canRemoveClassFromTerm, canRemoveSubjectFromClassTerm } from "@/lib/class-term-rules"

// Assign a class to a term
export async function assignClassToTerm({
  classId,
  termId,
}: {
  classId: string
  termId: string
}) {
  // Verify the current user is authorized
  const actor = await requirePermission("academics.manage")

  try {
    // Get the class
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, schoolId: true },
    })

    if (!classData) {
      throw new Error("Class not found")
    }

    // Get the term
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: {
        session: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!term) {
      throw new Error("Term not found")
    }

    // If admin, verify they are managing a class for their assigned school
    assertSchoolAccess(actor, classData.schoolId)
    assertSchoolAccess(actor, term.session.schoolId)

    // Check if the class is already assigned to this term
    const existingClassTerm = await prisma.classTerm.findFirst({
      where: {
        classId,
        termId,
      },
    })

    if (existingClassTerm) {
      return { success: true, classTermId: existingClassTerm.id }
    }

    // Create the class term
    const classTerm = await prisma.classTerm.create({
      data: {
        classId,
        termId,
      },
    })

    revalidatePath("/dashboard/admin/class-terms")
    return { success: true, classTermId: classTerm.id }
  } catch (error) {
    console.error("Failed to assign class to term:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to assign class to term")
  }
}

// Remove a class from a term
export async function removeClassFromTerm(classTermId: string) {
  // Verify the current user is authorized
  const actor = await requirePermission("academics.manage")

  try {
    // Get the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    // If admin, verify they are managing a class for their assigned school
    assertSchoolAccess(actor, classTerm.class.schoolId)

    // Everything that would be lost is counted BEFORE anything is deleted. This used to
    // delete the class's subject assignments first and only then check the roll, so
    // removing a class that had students wiped its subject list and *then* refused —
    // the school lost the subjects and was told nothing had happened.
    const [enrolledStudents, recordedScores] = await Promise.all([
      prisma.studentClassTerm.count({ where: { classTermId } }),
      prisma.assessment.count({ where: { studentClassTerm: { classTermId } } }),
    ])

    const verdict = canRemoveClassFromTerm({ enrolledStudents, recordedScores })
    if (!verdict.allowed) {
      throw new Error(`Cannot remove this class from the term: ${verdict.reason}`)
    }

    // One transaction, so a failure part-way cannot leave a class term with its subjects
    // already gone.
    await prisma.$transaction(async (tx) => {
      await tx.classSubject.deleteMany({ where: { classTermId } })
      await tx.classTerm.delete({ where: { id: classTermId } })
    })

    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to remove class from term:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || "Failed to remove class from term")
  }
}

// Assign subjects to a class term
export async function assignSubjectsToClassTerm({
  classTermId,
  subjectIds,
}: {
  classTermId: string
  subjectIds: string[]
}) {
  // Verify the current user is authorized
  const actor = await requirePermission("academics.manage")

  try {
    // Get the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            id: true,
            schoolId: true,
          },
        },
        classSubjects: {
          select: {
            subjectId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    // If admin, verify they are managing a class for their assigned school
    assertSchoolAccess(actor, classTerm.class.schoolId)

    // Get currently assigned subject IDs
    const currentSubjectIds = classTerm.classSubjects.map((cs) => cs.subjectId)

    // Find subjects to remove (in current but not in new list)
    const subjectsToRemove = currentSubjectIds.filter((id) => !subjectIds.includes(id))

    // Dropping a subject does not delete its scores, but it does take the subject off the
    // class — so those scores stop appearing on the entry sheet and the report card with
    // nothing to say why. Refused here as well as greyed out in the form, because the
    // form's counts were read when the page loaded.
    if (subjectsToRemove.length > 0) {
      const marked = await prisma.assessment.groupBy({
        by: ["subjectId"],
        where: {
          subjectId: { in: subjectsToRemove },
          studentClassTerm: { classTermId },
        },
        _count: { _all: true },
      })

      const blocked = marked.filter(
        (row) => !canRemoveSubjectFromClassTerm({ recordedScores: row._count._all }).allowed,
      )

      if (blocked.length > 0) {
        const names = await prisma.subject.findMany({
          where: { id: { in: blocked.map((row) => row.subjectId) } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
        const detail = names
          .map((subject) => {
            const count = blocked.find((row) => row.subjectId === subject.id)?._count._all ?? 0
            return `${subject.name} (${count})`
          })
          .join(", ")
        throw new Error(
          `Cannot remove ${names.length === 1 ? "this subject" : "these subjects"} — scores have ` +
            `already been recorded for them this term: ${detail}`,
        )
      }
    }

    // Find subjects to add (in new list but not in current)
    const subjectsToAdd = subjectIds.filter((id) => !currentSubjectIds.includes(id))

    // Validate subjects to add outside the transaction to avoid long-running transactions
    if (subjectsToAdd.length > 0) {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectsToAdd } },
        select: { id: true, schoolId: true },
      })

      // Ensure all requested subjects exist
      const foundIds = new Set(subjects.map((s) => s.id))
      for (const sid of subjectsToAdd) {
        if (!foundIds.has(sid)) {
          throw new Error(`Subject not found: ${sid}`)
        }
      }

      // Ensure all subjects belong to the same school as the class
      for (const s of subjects) {
        if (s.schoolId !== classTerm.class.schoolId) {
          throw new Error("Subject does not belong to the same school as the class")
        }
      }
    }

    // Start a transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Remove subjects that are no longer assigned
      if (subjectsToRemove.length > 0) {
        await tx.classSubject.deleteMany({
          where: {
            classTermId,
            subjectId: { in: subjectsToRemove },
          },
        })
      }

      // Add newly assigned subjects using createMany to minimize per-item queries
      if (subjectsToAdd.length > 0) {
        const createData = subjectsToAdd.map((subjectId) => ({
          classTermId,
          classId: classTerm.class.id,
          subjectId,
        }))

        // Use createMany for bulk insert; skipDuplicates in case of race conditions
        await tx.classSubject.createMany({ data: createData, skipDuplicates: true })
      }
    })

    revalidatePath(`/dashboard/admin/class-terms/${classTermId}/subjects`)
    revalidatePath("/dashboard/admin/class-terms")
    return { success: true }
  } catch (error) {
    console.error("Failed to assign subjects to class term:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || "Failed to assign subjects to class term")
  }
}
