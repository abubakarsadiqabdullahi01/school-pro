"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { requireTeacher } from "@/lib/authz"
import { recordAudit } from "@/lib/audit"
import {
  MAX_RATING,
  MIN_RATING,
  REPORT_TRAITS,
  findTrait,
  isTraitCode,
} from "@/lib/report-traits"

/**
 * Affective and psychomotor ratings, entered by the class teacher.
 *
 * Scoped to a class term the teacher is actually assigned to, the same check the
 * assessment actions make: a teacher can rate the children in front of them and
 * nobody else's.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

const ratingsSchema = z.object({
  classTermId: z.string().min(1),
  ratings: z
    .array(
      z.object({
        studentId: z.string().min(1),
        trait: z.string().refine(isTraitCode, "Unknown trait"),
        // null clears a rating the teacher entered by mistake.
        rating: z.number().int().min(MIN_RATING).max(MAX_RATING).nullable(),
      }),
    )
    .max(2000),
})

/** The teacher's own record, plus proof they teach this class term. */
async function authorizeForClassTerm(classTermId: string) {
  const actor = await requireTeacher()

  const assignment = await prisma.teacherClassTerm.findFirst({
    where: { teacherId: actor.teacherId ?? undefined, classTermId },
    select: {
      classTerm: {
        select: {
          id: true,
          termId: true,
          class: { select: { id: true, name: true, schoolId: true } },
          term: { select: { id: true, name: true, session: { select: { name: true } } } },
        },
      },
    },
  })

  if (!assignment) throw new Error("You are not assigned to this class")
  return { actor, classTerm: assignment.classTerm }
}

/**
 * The entry grid: every student in the class term, with whatever has been rated
 * so far. Students with no ratings come back with an empty map rather than being
 * left out, so the grid always shows the whole class.
 */
export async function getClassTraitRatings(classTermId: string): Promise<ActionResult<{
  className: string
  termName: string
  sessionName: string
  traits: Array<{ code: string; label: string; domain: string }>
  students: Array<{
    id: string
    admissionNo: string
    fullName: string
    ratings: Record<string, number>
  }>
}>> {
  try {
    const { classTerm } = await authorizeForClassTerm(classTermId)

    const [enrolments, recorded] = await Promise.all([
      prisma.studentClassTerm.findMany({
        where: { classTermId, status: "ACTIVE" },
        select: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { student: { user: { firstName: "asc" } } },
      }),
      prisma.studentTraitRating.findMany({
        where: { classTermId, termId: classTerm.termId },
        select: { studentId: true, trait: true, rating: true },
      }),
    ])

    const byStudent = new Map<string, Record<string, number>>()
    for (const row of recorded) {
      const existing = byStudent.get(row.studentId) ?? {}
      existing[row.trait] = row.rating
      byStudent.set(row.studentId, existing)
    }

    return {
      success: true,
      data: {
        className: classTerm.class.name,
        termName: classTerm.term.name,
        sessionName: classTerm.term.session.name,
        traits: REPORT_TRAITS.map((trait) => ({ ...trait })),
        students: enrolments.map(({ student }) => ({
          id: student.id,
          admissionNo: student.admissionNo,
          fullName: `${student.user.firstName} ${student.user.lastName}`,
          ratings: byStudent.get(student.id) ?? {},
        })),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not load the class",
    }
  }
}

/**
 * Saves the grid.
 *
 * Written one student-trait at a time through an upsert on (studentId, termId,
 * trait): the teacher is editing a sheet, so re-saving must correct what is
 * there rather than add a second rating. A null clears the rating instead of
 * storing a zero, which is not on the 1–5 scale and would print as one.
 */
export async function saveTraitRatings(input: unknown): Promise<ActionResult<{
  saved: number
  cleared: number
}>> {
  try {
    const data = ratingsSchema.parse(input)
    const { actor, classTerm } = await authorizeForClassTerm(data.classTermId)

    // Only students actually in this class term, so a stale grid cannot write a
    // rating onto a child who has since been transferred out.
    const enrolled = await prisma.studentClassTerm.findMany({
      where: { classTermId: data.classTermId, status: "ACTIVE" },
      select: { studentId: true },
    })
    const enrolledIds = new Set(enrolled.map((row) => row.studentId))

    const writes = data.ratings.filter((row) => enrolledIds.has(row.studentId))
    const toClear = writes.filter((row) => row.rating === null)
    const toSave = writes.filter((row) => row.rating !== null)

    await prisma.$transaction(async (tx) => {
      if (toClear.length > 0) {
        await tx.studentTraitRating.deleteMany({
          where: {
            termId: classTerm.termId,
            OR: toClear.map((row) => ({ studentId: row.studentId, trait: row.trait })),
          },
        })
      }

      for (const row of toSave) {
        const trait = findTrait(row.trait)
        if (!trait) continue

        await tx.studentTraitRating.upsert({
          where: {
            studentId_termId_trait: {
              studentId: row.studentId,
              termId: classTerm.termId,
              trait: row.trait,
            },
          },
          update: { rating: row.rating as number, recordedBy: actor.userId, classTermId: data.classTermId },
          create: {
            schoolId: classTerm.class.schoolId,
            studentId: row.studentId,
            termId: classTerm.termId,
            classTermId: data.classTermId,
            domain: trait.domain,
            trait: row.trait,
            rating: row.rating as number,
            recordedBy: actor.userId,
          },
        })
      }
    })

    await recordAudit({
      actor,
      action: "student.trait_ratings_save",
      entityType: "ClassTerm",
      entityId: data.classTermId,
      summary:
        `Rated behaviour and skills for ${classTerm.class.name}, ${classTerm.term.name}: ` +
        `${toSave.length} saved, ${toClear.length} cleared`,
    })

    revalidatePath(`/dashboard/teacher/my-classes/${data.classTermId}/traits`)
    return { success: true, data: { saved: toSave.length, cleared: toClear.length } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not save the ratings",
    }
  }
}
