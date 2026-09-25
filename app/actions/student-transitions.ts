"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { raiseEnrolmentCharges } from "@/lib/fee-charges.server";
import { revalidatePath } from "next/cache";

import { calculateGrade } from "@/lib/grading";
import type { GradingSystem } from "@/lib/grading";
import { gradingSystemFromSnapshot } from "@/lib/result-snapshot";
import type { PromotionEvaluationScope } from "@prisma/client";
import {
  DEFAULT_PROMOTION_POLICY,
  splitByEligibility,
  type PromotionPolicy,
  type SubjectOutcome,
  type StudentResultSummary,
} from "@/lib/promotion";

// Enhanced authorization function
// Delegates to the shared boundary in lib/authz.ts. `undefined` still means "super
// admin, no school filter", which is what every caller in this file expects.
async function authorizeAndGetSchoolId(): Promise<string | undefined> {
  const actor = await requirePermission("students.manage");
  return actor.schoolId ?? undefined;
}

// Get available sessions and terms for transition
export async function getTransitionOptions() {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Get all sessions for the school
    const sessions = await prisma.session.findMany({
      where: {
        schoolId,
      },
      include: {
        terms: {
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            name: true,
            isCurrent: true,
            session: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    // Get current session and term
    const currentTerm = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        session: {
          schoolId,
        },
      },
      include: {
        session: true,
      },
    });

    console.log("Sessions found:", sessions.length);
    console.log("Current term:", currentTerm?.name);

    return {
      success: true,
      data: {
        sessions,
        currentTerm,
      },
    };
  } catch (error) {
    console.error("Failed to get transition options:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get classes available for transition
export async function getTransitionClasses(
  fromTermId: string,
  toTermId: string,
) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    console.log("Getting classes for terms:", {
      fromTermId,
      toTermId,
      schoolId,
    });

    // First, let's check if the terms exist
    const [fromTerm, toTerm] = await Promise.all([
      prisma.term.findUnique({
        where: { id: fromTermId },
        include: { session: true },
      }),
      prisma.term.findUnique({
        where: { id: toTermId },
        include: { session: true },
      }),
    ]);

    console.log("From term:", fromTerm?.name, "To term:", toTerm?.name);

    if (!fromTerm || !toTerm) {
      throw new Error("One or both terms not found");
    }

    // Get source term classes
    const sourceClasses = await prisma.classTerm.findMany({
      where: {
        termId: fromTermId,
        class: {
          schoolId,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
      orderBy: {
        class: {
          name: "asc",
        },
      },
    });

    console.log("Source classes found:", sourceClasses.length);

    // Get destination term classes
    const destinationClasses = await prisma.classTerm.findMany({
      where: {
        termId: toTermId,
        class: {
          schoolId,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
      orderBy: {
        class: {
          name: "asc",
        },
      },
    });

    console.log("Destination classes found:", destinationClasses.length);

    // If no source classes found, let's check if there are any classes for this school
    if (sourceClasses.length === 0) {
      const allClasses = await prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, level: true },
      });
      console.log("Total classes in school:", allClasses.length);

      const allClassTerms = await prisma.classTerm.findMany({
        where: {
          class: { schoolId },
        },
        include: {
          class: { select: { name: true } },
          term: { select: { name: true } },
        },
      });
      console.log("Total class terms:", allClassTerms.length);
    }

    return {
      success: true,
      data: {
        sourceClasses: sourceClasses || [],
        destinationClasses: destinationClasses || [],
      },
    };
  } catch (error) {
    console.error("Failed to get transition classes:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get students eligible for transition with their performance data
export async function getStudentsForTransition(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Verify access to the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
            name: true,
            level: true,
          },
        },
        term: {
          select: {
            id: true,
            name: true,
          },
        },
        resultWorkflow: { select: { gradingSnapshot: true } },
      },
    });

    if (!classTerm) {
      throw new Error("Class term not found");
    }

    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school");
    }

    // Get grading system
    const gradingSystemData = await prisma.gradingSystem.findFirst({
      where: {
        schoolId: schoolId || classTerm.class.schoolId,
        isDefault: true,
      },
      include: {
        levels: {
          orderBy: { minScore: "desc" },
        },
      },
    });

    const frozenGradingSystem = gradingSystemFromSnapshot(classTerm.resultWorkflow?.gradingSnapshot);
    const gradingSystem: GradingSystem = frozenGradingSystem ?? (gradingSystemData
      ? {
          levels: gradingSystemData.levels.map((level) => ({
            minScore: level.minScore,
            maxScore: level.maxScore,
            grade: level.grade,
            remark: level.remark,
          })),
          passMark: gradingSystemData.passMark,
        }
      : {
          levels: [
            { minScore: 80, maxScore: 100, grade: "A1", remark: "Excellent" },
            { minScore: 70, maxScore: 79, grade: "A2", remark: "Very Good" },
            { minScore: 60, maxScore: 69, grade: "B1", remark: "Good" },
            { minScore: 50, maxScore: 59, grade: "B2", remark: "Fair" },
            { minScore: 45, maxScore: 49, grade: "C1", remark: "Pass" },
            { minScore: 40, maxScore: 44, grade: "C2", remark: "Weak Pass" },
            { minScore: 0, maxScore: 39, grade: "F", remark: "Fail" },
          ],
          passMark: 40,
        });

    // Get active students in the class with their assessments. Historical rows are kept
    // for audit, but they must not be offered for another transition.
    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        classTermId,
        status: "ACTIVE",
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
              },
            },
          },
        },
        assessments: {
          where: {
            termId: classTerm.term.id,
          },
          include: {
            subject: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        student: {
          user: {
            firstName: "asc",
          },
        },
      },
    });

    // Calculate performance for each student
    const studentsWithPerformance = studentClassTerms.map((sct) => {
      const student = sct.student;
      const assessments = sct.assessments;

      // Calculate overall performance
      let totalScore = 0;
      let subjectCount = 0;
      let passedSubjects = 0;
      let failedSubjects = 0;
      const subjectGrades: string[] = [];

      assessments.forEach((assessment) => {
        if (!assessment.isAbsent && !assessment.isExempt) {
          const subjectTotal =
            (assessment.ca1 || 0) +
            (assessment.ca2 || 0) +
            (assessment.ca3 || 0) +
            (assessment.exam || 0);

          const gradeResult = calculateGrade(subjectTotal, gradingSystem);
          // A score no band covers has no grade. Skipping it keeps the grade list honest;
          // pushing a placeholder would let it be counted as an achieved grade downstream.
          if (gradeResult.grade !== null) {
            subjectGrades.push(gradeResult.grade);
          }

          if (subjectTotal >= gradingSystem.passMark) {
            passedSubjects++;
          } else {
            failedSubjects++;
          }

          totalScore += subjectTotal;
          subjectCount++;
        }
      });

      const averageScore = subjectCount > 0 ? totalScore / subjectCount : 0;
      const overallGradeResult = calculateGrade(averageScore, gradingSystem);

      // Determine transition eligibility
      const passRate =
        subjectCount > 0 ? (passedSubjects / subjectCount) * 100 : 0;
      const isEligible = determineTransitionEligibility(
        averageScore,
        passRate,
        failedSubjects,
        gradingSystem.passMark,
      );

      return {
        studentId: student.id,
        studentClassTermId: sct.id,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
        gender: student.user.gender || "OTHER",
        // totalScore is computed at runtime; do not persist
        averageScore,
        grade: overallGradeResult.grade,
        remark: overallGradeResult.remark,
        subjectsOffered: subjectCount,
        subjectsPassed: passedSubjects,
        subjectsFailed: failedSubjects,
        passRate,
        isEligible,
        eligibilityReason: getEligibilityReason(
          averageScore,
          passRate,
          failedSubjects,
          gradingSystem.passMark,
        ),
        subjectGrades,
        position: 0, // Will be set below
      };
    });

    // Sort by average score (descending)
    studentsWithPerformance.sort((a, b) => b.averageScore - a.averageScore);

    // Assign positions
    let currentPosition = 1;
    let previousScore = -1;
    studentsWithPerformance.forEach((student, index) => {
      if (student.averageScore !== previousScore) {
        currentPosition = index + 1;
      }
      student.position = currentPosition;
      previousScore = student.averageScore;
    });

    return {
      success: true,
      data: {
        classInfo: {
          className: classTerm.class.name,
          classLevel: classTerm.class.level,
          termName: classTerm.term.name,
        },
        students: studentsWithPerformance,
        gradingSystem,
        statistics: {
          totalStudents: studentsWithPerformance.length,
          eligibleStudents: studentsWithPerformance.filter((s) => s.isEligible)
            .length,
          ineligibleStudents: studentsWithPerformance.filter(
            (s) => !s.isEligible,
          ).length,
          averageClassScore:
            studentsWithPerformance.length > 0
              ? studentsWithPerformance.reduce(
                  (sum, s) => sum + s.averageScore,
                  0,
                ) / studentsWithPerformance.length
              : 0,
        },
      },
    };
  } catch (error) {
    console.error("Failed to get students for transition:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Determine if a student is eligible for transition
function determineTransitionEligibility(
  averageScore: number,
  passRate: number,
  failedSubjects: number,
  passMark: number,
): boolean {
  // Multiple criteria for transition eligibility
  if (averageScore >= passMark && passRate >= 50) {
    return true; // Strong performance
  }
  if (averageScore >= passMark * 0.8 && failedSubjects <= 2) {
    return true; // Acceptable performance with few failures
  }
  if (passRate >= 70) {
    return true; // High pass rate even if average is slightly low
  }
  return false; // Not eligible
}

// Get reason for eligibility/ineligibility
function getEligibilityReason(
  averageScore: number,
  passRate: number,
  failedSubjects: number,
  passMark: number,
): string {
  if (averageScore >= passMark && passRate >= 50) {
    return "Excellent performance - meets all criteria";
  }
  if (averageScore >= passMark * 0.8 && failedSubjects <= 2) {
    return "Good performance - acceptable with few failures";
  }
  if (passRate >= 70) {
    return "High pass rate - eligible despite lower average";
  }
  if (averageScore < passMark * 0.6) {
    return "Below minimum average score requirement";
  }
  if (failedSubjects > 3) {
    return "Too many failed subjects";
  }
  if (passRate < 40) {
    return "Low pass rate - needs improvement";
  }
  return "Does not meet transition criteria";
}

// Execute student transitions
export async function executeStudentTransitions(transitions: {
  fromClassTermId: string;
  toClassTermId: string;
  studentIds: string[];
  transitionType: "PROMOTION" | "TRANSFER" | "WITHDRAWAL";
  notes?: string;
  /**
   * Promote students the policy would block anyway. A deliberate act by an admin who has
   * seen the reasons, recorded in the transition notes so the override is visible later.
   */
  overrideIneligible?: boolean;
}) {
  try {
    const actor = await requirePermission("students.manage");
    const schoolId = actor.schoolId ?? undefined;
    const {
      fromClassTermId,
      toClassTermId,
      studentIds,
      transitionType,
      notes,
      overrideIneligible = false,
    } = transitions;

    // Verify access to both class terms
    const [fromClassTerm, toClassTerm] = await Promise.all([
      prisma.classTerm.findUnique({
        where: { id: fromClassTermId },
        include: {
          class: { select: { schoolId: true, name: true, level: true } },
          term: { select: { name: true, session: { select: { name: true } } } },
        },
      }),
      prisma.classTerm.findUnique({
        where: { id: toClassTermId },
        include: {
          class: { select: { schoolId: true, name: true, level: true } },
          term: { select: { name: true, session: { select: { name: true } } } },
        },
      }),
    ]);

    if (!fromClassTerm || !toClassTerm) {
      throw new Error("Source or destination class term not found");
    }

    if (
      schoolId &&
      (fromClassTerm.class.schoolId !== schoolId ||
        toClassTerm.class.schoolId !== schoolId)
    ) {
      throw new Error("Classes do not belong to admin's school");
    }

    const userId = actor.userId;

    // The promotion policy only governs promotion. A transfer moves a student sideways and
    // a withdrawal ends their enrolment; neither is a judgement on their results.
    let overriddenNames: string[] = [];
    if (transitionType === "PROMOTION") {
      const policyResult = await getTransitionPolicy();
      const policy: PromotionPolicy = policyResult.data ?? DEFAULT_PROMOTION_POLICY;

      if (policy.requireResultsPublished || policy.usePromotionCriteria) {
        const gradingSystem = await prisma.gradingSystem.findFirst({
          where: schoolId ? { schoolId } : {},
          select: { passMark: true },
        });

        const summaries = await summariseResults(
          fromClassTermId,
          fromClassTerm.termId,
          studentIds,
          gradingSystem?.passMark ?? 40,
          policy,
        );
        const { ineligible } = splitByEligibility(summaries, policy);

        if (ineligible.length > 0) {
          if (!overrideIneligible || !policy.allowManualOverride) {
            // Named, with every reason, so the admin can fix the cause or knowingly override
            // rather than being told only that something failed.
            const detail = ineligible
              .map((verdict) => `${verdict.name}: ${verdict.reasons.join("; ")}`)
              .join(" | ");
            return {
              success: false,
              error:
                `${ineligible.length} student${ineligible.length === 1 ? " does" : "s do"} not meet ` +
                `the promotion policy — ${detail}.` +
                (policy.allowManualOverride ? " Override if you intend to promote them anyway." : ""),
              ineligible,
            };
          }
          overriddenNames = ineligible.map((verdict) => verdict.name);
        }
      }
    }

    const overrideNote = overriddenNames.length
      ? ` [policy overridden for: ${overriddenNames.join(", ")}]`
      : "";

    // Execute transitions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const transitionRecords = [];

      for (const studentId of studentIds) {
        // Get the student's current class term record
        const currentStudentClassTerm = await tx.studentClassTerm.findFirst({
          where: {
            studentId,
            classTermId: fromClassTermId,
            status: "ACTIVE",
          },
        });

        if (!currentStudentClassTerm) {
          throw new Error(`Student ${studentId} not found in source class`);
        }

        // Only a move needs a free destination. A withdrawal ends the enrolment where
        // it stands, so there is nothing to collide with.
        if (transitionType !== "WITHDRAWAL") {
          const existingRecord = await tx.studentClassTerm.findFirst({
            where: {
              studentId,
              classTermId: toClassTermId,
            },
          });

          if (existingRecord) {
            throw new Error(
              `Student ${studentId} already exists in destination class`,
            );
          }
        }

        const completedStatus =
          transitionType === "PROMOTION"
            ? "COMPLETED"
            : transitionType === "WITHDRAWAL"
              ? "DROPPED"
              : "TRANSFERRED";
        const historyAction =
          transitionType === "PROMOTION"
            ? "PROMOTED"
            : transitionType === "WITHDRAWAL"
              ? "WITHDRAWN"
              : "TRANSFERRED";

        await tx.studentClassTerm.update({
          where: { id: currentStudentClassTerm.id },
          data: { status: completedStatus },
        });

        // A promotion or transfer moves the student into a new ACTIVE enrolment. A
        // withdrawal does not: the student has left, so creating an ACTIVE row here would
        // keep them on class lists and — the part that costs money — inside fee billing,
        // which selects enrolments on status ACTIVE.
        const isWithdrawal = transitionType === "WITHDRAWAL";

        const newStudentClassTerm = isWithdrawal
          ? null
          : await tx.studentClassTerm.create({
              data: {
                studentId,
                classTermId: toClassTermId,
                termId: toClassTerm.termId,
                status: "ACTIVE",
              },
            });

        // The new class term's fees follow the student into it. A withdrawal
        // raises nothing, for the same reason it creates no ACTIVE enrolment.
        if (newStudentClassTerm) {
          await raiseEnrolmentCharges(tx, {
            schoolId: toClassTerm.class.schoolId,
            studentId,
            classTermId: toClassTermId,
            termId: toClassTerm.termId,
          });
        }

        await tx.studentEnrollmentHistory.create({
          data: {
            studentId,
            // A withdrawal is recorded against the class they left, not one they never joined.
            classTermId: isWithdrawal ? fromClassTermId : toClassTermId,
            termId: isWithdrawal ? currentStudentClassTerm.termId : toClassTerm.termId,
            action: historyAction,
            previousClassTermId: fromClassTermId,
            reason: notes || `Student ${transitionType.toLowerCase()}`,
            createdBy: userId,
          },
        });

        // Create transition record for audit trail
        const transitionRecord = await tx.studentTransition.create({
          data: {
            studentId,
            fromClassTermId,
            // The current schema requires a destination. For withdrawal the truthful
            // destination is the class being left, not an unrelated class selected by UI.
            toClassTermId: isWithdrawal ? fromClassTermId : toClassTermId,
            transitionType,
            transitionDate: new Date(),
            notes: `${notes || ""}${overrideNote}`.trim(),
            createdBy: userId,
          },
        });

        transitionRecords.push({
          studentId,
          transitionId: transitionRecord.id,
          // Null for a withdrawal: there is no onward enrolment.
          newStudentClassTermId: newStudentClassTerm?.id ?? null,
        });
      }

      return transitionRecords;
    });

    return {
      success: true,
      data: {
        transitionsCreated: result.length,
        transitions: result,
        message: `Successfully transitioned ${result.length} student${result.length > 1 ? "s" : ""} from ${fromClassTerm.class.name} to ${toClassTerm.class.name}`,
      },
    };
  } catch (error) {
    console.error("Failed to execute student transitions:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get transition history
export async function getTransitionHistory(
  studentId?: string,
  classTermId?: string,
) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    const whereClause: any = {};

    if (studentId) {
      whereClause.studentId = studentId;
    }

    if (classTermId) {
      whereClause.OR = [
        { fromClassTermId: classTermId },
        { toClassTermId: classTermId },
      ];
    }

    // Add school filter
    if (schoolId) {
      whereClause.student = {
        schoolId,
      };
    }

    const transitions = await prisma.studentTransition.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        fromClassTerm: {
          include: {
            class: { select: { name: true, level: true } },
            term: {
              select: {
                name: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        toClassTerm: {
          include: {
            class: { select: { name: true, level: true } },
            term: {
              select: {
                name: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { transitionDate: "desc" },
      // The history table filters and pages on the client, so this is the whole set it can
      // ever show. At 100 a single session's promotions already overflowed it and the page
      // reported "of 100" as though that were the total. 500 covers a full year for a
      // school of a few hundred; TransitionHistoryTable warns when the set is this size, so
      // a school that outgrows it is told rather than quietly shown less than the truth.
      take: 500,
    });

    const formattedTransitions = transitions.map((transition) => ({
      id: transition.id,
      studentName: `${transition.student.user.firstName} ${transition.student.user.lastName}`,
      admissionNo: transition.student.admissionNo,
      fromClass: transition.fromClassTerm.class.name,
      fromTerm: `${transition.fromClassTerm.term.session.name} - ${transition.fromClassTerm.term.name}`,
      toClass: transition.toClassTerm.class.name,
      toTerm: `${transition.toClassTerm.term.session.name} - ${transition.toClassTerm.term.name}`,
      transitionType: transition.transitionType,
      transitionDate: transition.transitionDate,
      notes: transition.notes,
      createdBy: transition.createdBy,
    }));

    return {
      success: true,
      data: formattedTransitions,
    };
  } catch (error) {
    console.error("Failed to get transition history:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get transition statistics
export async function getTransitionStatistics(termId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    const stats = await prisma.studentTransition.groupBy({
      by: ["transitionType"],
      where: {
        toClassTerm: {
          termId,
        },
        student: {
          schoolId,
        },
      },
      _count: {
        id: true,
      },
    });

    const totalTransitions = stats.reduce(
      (sum, stat) => sum + stat._count.id,
      0,
    );

    return {
      success: true,
      data: {
        totalTransitions,
        byType: stats.reduce(
          (acc, stat) => {
            acc[stat.transitionType] = stat._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    };
  } catch (error) {
    console.error("Failed to get transition statistics:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// ============================================
// PROMOTION POLICY
// ============================================

/**
 * The school's promotion policy, falling back to both rules off.
 *
 * Off is the right default: a school that has never configured this must keep behaving
 * exactly as it did before the feature existed.
 */
export async function getTransitionPolicy(): Promise<{
  success: boolean;
  data?: PromotionPolicy;
  error?: string;
}> {
  try {
    const schoolId = await authorizeAndGetSchoolId();
    if (!schoolId) return { success: true, data: DEFAULT_PROMOTION_POLICY };

    const stored = await prisma.transitionPolicy.findUnique({ where: { schoolId } });
    if (!stored) return { success: true, data: DEFAULT_PROMOTION_POLICY };

    return {
      success: true,
      data: {
        requireResultsPublished: stored.requireResultsPublished,
        usePromotionCriteria: stored.usePromotionCriteria,
        minAverage: stored.promotionMinAverage ? Number(stored.promotionMinAverage) : null,
        minSubjectsPassed: stored.minSubjectsPassed,
        evaluationScope: stored.evaluationScope,
        requiredSubjectIds: Array.isArray(stored.requiredSubjectIds)
          ? stored.requiredSubjectIds.map(String)
          : [],
        minCoreSubjectsPassed: stored.minCoreSubjectsPassed,
        requireAllSubjectsEntered: stored.requireAllSubjectsEntered,
        allowManualOverride: stored.allowManualOverride,
        minCreditsRequired: stored.minCreditsRequired,
        creditMark: Number(stored.creditMark),
        // A school-wide policy has no notion of a final year; that belongs to a class.
        isGraduatingClass: false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load the promotion policy",
    };
  }
}

export async function saveTransitionPolicy(input: {
  requireResultsPublished: boolean;
  usePromotionCriteria: boolean;
  minAverage?: number | null;
  minSubjectsPassed?: number | null;
  evaluationScope?: "TERM" | "SESSION_AVERAGE";
  requiredSubjectIds?: string[];
  minCoreSubjectsPassed?: number | null;
  requireAllSubjectsEntered?: boolean;
  allowManualOverride?: boolean;
  minCreditsRequired?: number | null;
  creditMark?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const schoolId = await authorizeAndGetSchoolId();
    if (!schoolId) throw new Error("Select a school before setting a promotion policy");

    const minAverage =
      input.minAverage != null && Number.isFinite(input.minAverage) ? input.minAverage : null;
    const minSubjectsPassed =
      input.minSubjectsPassed != null && Number.isFinite(input.minSubjectsPassed)
        ? Math.trunc(input.minSubjectsPassed)
        : null;
    const minCoreSubjectsPassed =
      input.minCoreSubjectsPassed != null && Number.isFinite(input.minCoreSubjectsPassed)
        ? Math.trunc(input.minCoreSubjectsPassed)
        : null;
    const requiredSubjectIds = Array.isArray(input.requiredSubjectIds)
      ? [...new Set(input.requiredSubjectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
      : [];
    const evaluationScope: PromotionEvaluationScope =
      input.evaluationScope === "SESSION_AVERAGE" ? "SESSION_AVERAGE" : "TERM";
    const minCreditsRequired =
      input.minCreditsRequired != null && Number.isFinite(input.minCreditsRequired)
        ? Math.trunc(input.minCreditsRequired)
        : null;
    const creditMark =
      input.creditMark != null && Number.isFinite(input.creditMark) ? input.creditMark : 50;

    if (minAverage != null && (minAverage < 0 || minAverage > 100)) {
      throw new Error("The minimum average must be between 0 and 100");
    }
    if (minSubjectsPassed != null && minSubjectsPassed < 0) {
      throw new Error("The minimum number of subjects passed cannot be negative");
    }
    if (minCoreSubjectsPassed != null && minCoreSubjectsPassed < 0) {
      throw new Error("The minimum number of core subjects passed cannot be negative");
    }
    if (minCreditsRequired != null && minCreditsRequired < 0) {
      throw new Error("The minimum number of credits cannot be negative");
    }
    if (creditMark < 0 || creditMark > 100) {
      throw new Error("The credit mark must be between 0 and 100");
    }
    if (minCoreSubjectsPassed != null && requiredSubjectIds.length === 0) {
      throw new Error("Choose the required/core subjects before setting a core-subject pass rule");
    }
    // A bar with nothing set would silently pass everyone, which is not what switching it
    // on is meant to mean.
    if (
      input.usePromotionCriteria &&
      minAverage == null &&
      minSubjectsPassed == null &&
      minCoreSubjectsPassed == null &&
      minCreditsRequired == null &&
      !input.requireAllSubjectsEntered
    ) {
      throw new Error(
        "Set a minimum average, subjects passed, credits, core subjects, or missing-subject rule before turning the criteria on",
      );
    }

    const data = {
      requireResultsPublished: input.requireResultsPublished,
      usePromotionCriteria: input.usePromotionCriteria,
      promotionMinAverage: minAverage,
      minSubjectsPassed,
      evaluationScope,
      requiredSubjectIds,
      minCoreSubjectsPassed,
      requireAllSubjectsEntered: Boolean(input.requireAllSubjectsEntered),
      allowManualOverride: input.allowManualOverride !== false,
      minCreditsRequired,
      creditMark,
    };

    await prisma.transitionPolicy.upsert({
      where: { schoolId },
      create: { schoolId, ...data },
      update: data,
    });

    revalidatePath("/dashboard/admin/compiler/student-transitions");
    revalidatePath("/dashboard/admin/school-settings");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save the promotion policy",
    };
  }
}

/**
 * Result summaries for a set of students in one class term, in the shape the policy needs.
 *
 * Absent and exempt entries are excluded from the average, matching how the transition
 * picker already reports performance — so the figure an admin sees on screen is the figure
 * the rule is applied to.
 */
async function summariseResults(
  classTermId: string,
  termId: string,
  studentIds: string[],
  passMark: number,
  policy: PromotionPolicy,
): Promise<StudentResultSummary[]> {
  const context = await prisma.classTerm.findUnique({
    where: { id: classTermId },
    select: {
      term: { select: { sessionId: true, session: { select: { schoolId: true } } } },
      classSubjects: { select: { subjectId: true } },
    },
  });
  if (!context) throw new Error("Source class term not found");

  const [students, terms, scheme] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    }),
    policy.evaluationScope === "SESSION_AVERAGE"
      ? prisma.term.findMany({
          where: { sessionId: context.term.sessionId },
          select: { id: true },
        })
      : Promise.resolve([{ id: termId }]),
    prisma.assessmentScheme.findUnique({
      where: { schoolId: context.term.session.schoolId },
      select: { ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
    }),
  ]);

  const termIds = terms.map((term) => term.id);
  const subjectIds = [
    ...new Set([
      ...context.classSubjects.map((subject) => subject.subjectId),
      ...policy.requiredSubjectIds,
    ]),
  ];
  const assessments = await prisma.assessment.findMany({
    where: { studentId: { in: studentIds }, termId: { in: termIds }, subjectId: { in: subjectIds } },
    select: {
      studentId: true,
      subjectId: true,
      ca1: true,
      ca2: true,
      ca3: true,
      exam: true,
      isAbsent: true,
      isExempt: true,
      isPublished: true,
    },
  });

  const requiredComponents = {
    ca1: (scheme?.ca1Max ?? 10) > 0,
    ca2: (scheme?.ca2Max ?? 10) > 0,
    ca3: (scheme?.ca3Max ?? 10) > 0,
    exam: (scheme?.examMax ?? 70) > 0,
  };

  return students.map((student) => {
    const studentRows = assessments.filter((row) => row.studentId === student.id);
    const subjectResults: SubjectOutcome[] = [];
    const missingSubjectIds: string[] = [];
    let hasUnpublishedResults = false;

    for (const subjectId of subjectIds) {
      const subjectRows = studentRows.filter((row) => row.subjectId === subjectId);
      if (subjectRows.some((row) => !row.isPublished)) hasUnpublishedResults = true;

      const usableScores = subjectRows.flatMap((row) => {
        if (row.isAbsent || row.isExempt) return [];
        const complete =
          (!requiredComponents.ca1 || row.ca1 != null) &&
          (!requiredComponents.ca2 || row.ca2 != null) &&
          (!requiredComponents.ca3 || row.ca3 != null) &&
          (!requiredComponents.exam || row.exam != null);
        if (!complete) return [];
        return [(row.ca1 ?? 0) + (row.ca2 ?? 0) + (row.ca3 ?? 0) + (row.exam ?? 0)];
      });

      if (usableScores.length === 0) {
        missingSubjectIds.push(subjectId);
        continue;
      }
      const average = usableScores.reduce((sum, score) => sum + score, 0) / usableScores.length;
      // `score` is what the credit rule counts against. Carrying it here rather than
      // recomputing keeps one definition of a subject's mark for this period.
      subjectResults.push({ subjectId, passed: average >= passMark, score: average });
    }

    const subjectScores = subjectResults.map((result) => {
      const rows = studentRows.filter((row) => row.subjectId === result.subjectId);
      const scores = rows
        .filter((row) => !row.isAbsent && !row.isExempt)
        .map((row) => (row.ca1 ?? 0) + (row.ca2 ?? 0) + (row.ca3 ?? 0) + (row.exam ?? 0));
      return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    });

    return {
      studentId: student.id,
      name: `${student.user.firstName} ${student.user.lastName}`,
      subjectCount: subjectResults.length,
      averageScore:
        subjectScores.length > 0
          ? subjectScores.reduce((sum, score) => sum + score, 0) / subjectScores.length
          : 0,
      passedSubjects: subjectResults.filter((result) => result.passed).length,
      hasUnpublishedResults,
      missingSubjectIds,
      subjectResults,
    };
  });
}
