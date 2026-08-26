import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { resolveGrade, type GradeResult, type GradingSystem } from "@/lib/grading"

/**
 * Server-only half of grading: loading a school's configured bands.
 *
 * Split out because `next/cache` cannot be imported into a unit test, and because the
 * grading *rules* should be testable without a database. Same pattern as
 * `lib/authz` / `lib/authz-scope` and `lib/school-context` / `lib/school-context.server`.
 *
 * This replaces three separate cached loaders, one in each of the compiler action files.
 */

/**
 * A school's default grading system, cached for an hour and invalidated by the `grading`
 * tag — the school-settings actions already revalidate that tag when bands are edited.
 */
export const loadGradingSystem = unstable_cache(
  async (schoolId: string): Promise<GradingSystem | null> => {
    try {
      const system = await prisma.gradingSystem.findFirst({
        where: { schoolId, isDefault: true },
        include: { levels: { orderBy: { minScore: "desc" } } },
      })

      if (!system) return null

      return {
        passMark: system.passMark,
        levels: system.levels.map((level) => ({
          minScore: level.minScore,
          maxScore: level.maxScore,
          grade: level.grade,
          remark: level.remark,
        })),
      }
    } catch (error) {
      // A transient read failure must not become a failing grade — that was the old
      // `catch { return { grade: "F" } }` bug. Returning null makes `resolveGrade` fall
      // back and warn, which is visible rather than silently wrong.
      console.error("Failed to load grading system for school", schoolId, error)
      return null
    }
  },
  ["grading-system"],
  { revalidate: 3600, tags: ["grading"] },
)

/** Resolves a score against a school's own bands. The everyday entry point. */
export async function gradeScoreForSchool(
  score: number | null | undefined,
  schoolId: string,
): Promise<GradeResult> {
  return resolveGrade(score, await loadGradingSystem(schoolId))
}
