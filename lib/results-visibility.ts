import { prisma } from "@/lib/db"

/**
 * What a family is allowed to see of a child's results.
 *
 * Releasing results is a controlled event in this system, not a side effect of a teacher
 * typing. `publishResults` stamps `isPublished`, `publishedAt` and `publishedBy` so the
 * school can say who released a set of marks and when, and `unpublishResults` can pull them
 * back. Student transitions already respect it: `executeStudentTransitions` refuses to
 * promote on unpublished marks.
 *
 * The student and parent dashboards did not. They read every assessment row, so a mark was
 * visible to the family the instant a teacher entered it — mid-entry, before moderation,
 * before a typo was corrected, and before the school had decided to release anything.
 *
 * Staff-facing screens deliberately do NOT use this: an admin needs to see draft marks, and
 * the compiler needs to see them to publish them at all.
 */
export const PUBLISHED_ONLY = { isPublished: true } as const

/** Scores that make up one assessment row. */
type ScoreParts = {
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
}

/**
 * The total for one subject, or null when nothing has been recorded.
 *
 * Null and zero are different answers and must not be conflated: a subject with no marks
 * entered is "not marked", while a genuine zero is a real result that belongs in the average.
 */
export function subjectTotal(assessment: ScoreParts): number | null {
  const parts = [assessment.ca1, assessment.ca2, assessment.ca3, assessment.exam]
  if (parts.every((part) => part === null || part === undefined)) return null
  return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
}

/**
 * The average across subjects, or null when there is nothing to average.
 *
 * The dashboards previously dropped any subject totalling 0 with `.filter(score => score > 0)`
 * before averaging. That silently excluded a real zero — the one mark a family most needs to
 * see — and pulled the average up.
 */
export function averageScore(assessments: ScoreParts[]): number | null {
  const totals = assessments
    .map(subjectTotal)
    .filter((total): total is number => total !== null)
  if (totals.length === 0) return null
  return Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length)
}

/**
 * Published assessments for one student in the current term, newest first.
 *
 * Exported so the rule can be tested against a real database rather than asserted about a
 * page component that cannot be called.
 */
export async function publishedAssessmentsForStudent(studentId: string) {
  return prisma.assessment.findMany({
    where: { studentId, ...PUBLISHED_ONLY },
    orderBy: { updatedAt: "desc" },
    include: {
      subject: { select: { name: true, code: true } },
      term: { select: { id: true, name: true, isCurrent: true } },
    },
  })
}
