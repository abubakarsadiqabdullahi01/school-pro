"use server"

import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/authz"
import {
  buildSessionClassReport,
  sessionScoreHeaders,
  type SessionClassReport,
} from "@/lib/results/session-report.server"

/**
 * A class's results for a whole session, for the staff screens.
 *
 * Guarded by `compiler.review_results`, the same permission the termly class results page
 * requires, because it is the same information over a longer period. No fee withholding
 * applies here — that rule is about what a family is shown, not about what the school can
 * see of its own marks.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type ClassSessionResults = {
  report: SessionClassReport
  scoreHeaders: [string, string, string, string, string]
  school: {
    schoolName: string
    schoolCode: string
    schoolAddress: string
    schoolPhone: string
    schoolEmail: string
    schoolLogo: string | null
  }
}

export async function getClassSessionResults(
  classId: string,
  sessionId: string,
): Promise<ActionResult<ClassSessionResults>> {
  try {
    const actor = await requirePermission("compiler.review_results")
    if (!actor.schoolId) return { success: false, error: "Select a school first" }

    const [report, school] = await Promise.all([
      buildSessionClassReport(classId, sessionId, actor.schoolId),
      prisma.school.findUnique({
        where: { id: actor.schoolId },
        select: { name: true, code: true, address: true, phone: true, email: true, logoUrl: true },
      }),
    ])

    if (!report) {
      return {
        success: false,
        error: "That class did not run in that session, so there is nothing to report.",
      }
    }
    if (!school) return { success: false, error: "School not found" }

    if (report.students.length === 0) {
      return {
        success: false,
        error: "No released results for this class in that session yet.",
      }
    }

    return {
      success: true,
      data: {
        report,
        scoreHeaders: sessionScoreHeaders(report.terms),
        school: {
          schoolName: school.name,
          schoolCode: school.code,
          schoolAddress: school.address ?? "",
          schoolPhone: school.phone ?? "",
          schoolEmail: school.email ?? "",
          schoolLogo: school.logoUrl,
        },
      },
    }
  } catch (error) {
    console.error("Error building the sessional class results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to build the sessional results",
    }
  }
}
