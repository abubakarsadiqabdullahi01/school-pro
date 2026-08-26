import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { DEFAULT_ASSESSMENT_SCHEME, type AssessmentScheme } from "@/lib/assessment-scheme"

/**
 * Server-only half of the assessment scheme: loading a school's configured split.
 *
 * Same split as `lib/grading` / `lib/grading.server` — `next/cache` cannot be imported
 * into a unit test, and the rules should be testable without a database.
 */

/**
 * A school's scheme, cached for an hour and invalidated by the `assessment-scheme` tag.
 *
 * Falls back to the default rather than throwing. A missing row means the school predates
 * this feature, and the default is exactly what its scores were already validated against,
 * so falling back changes nothing for them.
 */
export const loadAssessmentScheme = unstable_cache(
  async (schoolId: string): Promise<AssessmentScheme> => {
    try {
      const scheme = await prisma.assessmentScheme.findUnique({
        where: { schoolId },
        select: { name: true, ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
      })

      return scheme ?? DEFAULT_ASSESSMENT_SCHEME
    } catch (error) {
      // Falling back is safe here in a way it is not for grading: the default is the
      // stricter, historically-applied bound, so a transient failure cannot let a bad
      // score through.
      console.error("Failed to load assessment scheme for school", schoolId, error)
      return DEFAULT_ASSESSMENT_SCHEME
    }
  },
  ["assessment-scheme"],
  { revalidate: 3600, tags: ["assessment-scheme"] },
)
