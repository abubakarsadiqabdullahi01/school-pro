"use server";

import { prisma } from "@/lib/db";
import { assertSchoolAccess, requirePermission } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { log } from "@/lib/logger";
import { assertScoresWithinScheme } from "@/lib/assessment-scheme";
import { loadAssessmentScheme } from "@/lib/assessment-scheme.server";
import { gradeScoreForSchool } from "@/lib/grading.server";

// Enhanced types
interface AssessmentData {
  id?: string;
  studentId: string;
  subjectId: string;
  termId: string;
  studentClassTermId: string;
  ca1?: number | null;
  ca2?: number | null;
  ca3?: number | null;
  exam?: number | null;
  isAbsent?: boolean;
  isExempt?: boolean;
}

interface AssessmentWithCalculations extends AssessmentData {
  totalScore?: number | null;
  grade?: string | null;
  remark?: string | null;
}

// Delegates to the shared boundary in lib/authz.ts. The returned shape is unchanged —
// callers only ever read `user.id` — with `actor` added so a caller that needs to check
// school access does not have to resolve the session a second time.
async function authorizeAndGetUser() {
  const actor = await requirePermission("compiler.enter_scores");
  if (actor.role === "TEACHER") {
    throw new Error("Teachers must enter scores from their assigned class workspace");
  }

  return {
    actor,
    user: { id: actor.userId },
    schoolId: actor.schoolId ?? undefined,
    teacherId: actor.teacherId ?? undefined,
    role: actor.role,
  };
}

// Function to find teacher assigned to a subject for a specific class term
async function findAssignedTeacher(
  subjectId: string,
  classTermId: string,
): Promise<{
  teacherId: string | null;
  teacherName: string | null;
  isAssigned: boolean;
  message: string;
}> {
  try {
    log.debug(
      `Looking for teacher assigned to subject ${subjectId} in class term ${classTermId}`,
    );

    // Get subject and class information for better messaging
    const [subject, classTerm] = await Promise.all([
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { name: true, code: true },
      }),
      prisma.classTerm.findUnique({
        where: { id: classTermId },
        include: {
          class: { select: { name: true } },
          term: { select: { name: true } },
        },
      }),
    ]);

    const subjectName = subject
      ? `${subject.name} (${subject.code})`
      : "Unknown Subject";
    const className = classTerm?.class.name || "Unknown Class";

    // First, try to find a teacher assigned to this specific subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        subjectId: subjectId,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            teacherClassTerms: {
              where: {
                classTermId: classTermId,
              },
            },
          },
        },
      },
    });

    if (teacherSubject && teacherSubject.teacher.teacherClassTerms.length > 0) {
      const teacherName = `${teacherSubject.teacher.user.firstName} ${teacherSubject.teacher.user.lastName}`;
      log.debug(
        `Found teacher ${teacherSubject.teacher.id} (${teacherName}) assigned to subject ${subjectId}`,
      );
      return {
        teacherId: teacherSubject.teacher.id,
        teacherName,
        isAssigned: true,
        message: `Subject teacher: ${teacherName}`,
      };
    }

    // If no specific teacher-subject assignment, try to find a teacher assigned to the class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        classTermId: classTermId,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (teacherClassTerm) {
      const teacherName = `${teacherClassTerm.teacher.user.firstName} ${teacherClassTerm.teacher.user.lastName}`;
      log.debug(
        `Found class teacher ${teacherClassTerm.teacher.id} (${teacherName}) for class term ${classTermId}`,
      );
      return {
        teacherId: teacherClassTerm.teacher.id,
        teacherName,
        isAssigned: true,
        message: `Class teacher: ${teacherName} (no specific subject assignment)`,
      };
    }

    log.debug(
      `No teacher assigned to subject ${subjectId} or class term ${classTermId}`,
    );
    return {
      teacherId: null,
      teacherName: null,
      isAssigned: false,
      message: `⚠️ No teacher assigned to ${subjectName} for ${className}. Assessments will be saved without teacher assignment.`,
    };
  } catch (error) {
    console.error("Error finding assigned teacher:", error);
    return {
      teacherId: null,
      teacherName: null,
      isAssigned: false,
      message: "Error checking teacher assignment",
    };
  }
}

// Enhanced grading system with fallback

// Safe calculation functions
function calculateTotalScore(
  ca1: number | null,
  ca2: number | null,
  ca3: number | null,
  exam: number | null,
): number | null {
  // Only calculate if at least one score is provided
  const scores = [ca1, ca2, ca3, exam].filter(
    (score) => score !== null && score !== undefined && score > 0,
  );
  if (scores.length === 0) return null;

  return (ca1 || 0) + (ca2 || 0) + (ca3 || 0) + (exam || 0);
}

// Enhanced grade calculation
// Delegates to the single grading implementation in lib/grading.ts. This used to be a
// local copy of the bands and the fallback, one of three that agreed with each other but
// not with the class-term aggregation.
export async function calculateGradeFromScore(
  totalScore: number | null,
  schoolId: string,
): Promise<{ grade: string; remark: string } | null> {
  if (totalScore === null || totalScore === undefined) return null;

  const result = await gradeScoreForSchool(totalScore, schoolId);

  // Callers render this straight into a report card, so an unmatched score has to say so
  // rather than borrow a letter it did not earn.
  return result.grade === null
    ? { grade: "\u2014", remark: result.remark }
    : { grade: result.grade, remark: result.remark };
}

// NEW: Enhanced function to get assessments with completion status for a class term and subject
export async function getAssessmentsWithStatus(
  classTermId: string,
  subjectId: string,
  termId: string,
) {
  try {
    const { schoolId } = await authorizeAndGetUser();

    // Verify the class term exists and user has access
    const classTerm = await prisma.classTerm.findFirst({
      where: {
        id: classTermId,
        class: {
          ...(schoolId && { schoolId }),
        },
      },
      include: {
        term: {
          select: {
            id: true,
            name: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!classTerm) {
      return {
        success: false,
        error: "Class term not found or you don't have access to it",
      };
    }

    // Get all student class terms for this class term
    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        classTermId,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
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
        assessments: {
          where: {
            subjectId,
            termId,
          },
          select: {
            id: true,
            ca1: true,
            ca2: true,
            ca3: true,
            exam: true,
            isAbsent: true,
            isExempt: true,
            isPublished: true,
            createdAt: true,
            updatedAt: true,
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

    // Calculate completion statistics
    const totalStudents = studentClassTerms.length;
    let studentsWithData = 0;
    let completeAssessments = 0;
    let partialAssessments = 0;
    let absentStudents = 0;
    let exemptStudents = 0;

    // Format the data with enhanced status information
    const assessments = await Promise.all(
      studentClassTerms.map(async (sct) => {
        const assessment = sct.assessments[0]; // Should only be one assessment per student per subject per term

        let totalScore = null;
        let grade = null;
        let remark = null;
        let completionStatus = "not_started";
        let hasData = false;

        if (assessment) {
          hasData = true;
          studentsWithData++;

          if (assessment.isAbsent) {
            absentStudents++;
            completionStatus = "absent";
          } else if (assessment.isExempt) {
            exemptStudents++;
            completionStatus = "exempt";
          } else {
            // Check completion status
            const hasCA1 =
              assessment.ca1 !== null && assessment.ca1 !== undefined;
            const hasCA2 =
              assessment.ca2 !== null && assessment.ca2 !== undefined;
            const hasCA3 =
              assessment.ca3 !== null && assessment.ca3 !== undefined;
            const hasExam =
              assessment.exam !== null && assessment.exam !== undefined;

            const completedFields = [hasCA1, hasCA2, hasCA3, hasExam].filter(
              Boolean,
            ).length;

            if (completedFields === 4) {
              completionStatus = "complete";
              completeAssessments++;
            } else if (completedFields > 0) {
              completionStatus = "partial";
              partialAssessments++;
            } else {
              completionStatus = "not_started";
            }

            // Calculate totals and grades
            if (completedFields > 0) {
              totalScore = calculateTotalScore(
                assessment.ca1,
                assessment.ca2,
                assessment.ca3,
                assessment.exam,
              );

              if (totalScore !== null && schoolId) {
                const gradeInfo = await calculateGradeFromScore(
                  totalScore,
                  schoolId,
                );
                if (gradeInfo) {
                  grade = gradeInfo.grade;
                  remark = gradeInfo.remark;
                }
              }
            }
          }
        }

        return {
          id: assessment?.id || null,
          studentId: sct.student.id,
          studentClassTermId: sct.id,
          studentName: `${sct.student.user.firstName} ${sct.student.user.lastName}`,
          admissionNo: sct.student.admissionNo,
          ca1: assessment?.ca1 ?? null,
          ca2: assessment?.ca2 ?? null,
          ca3: assessment?.ca3 ?? null,
          exam: assessment?.exam ?? null,
          // totalScore is derived at runtime
          grade,
          remark,
          isAbsent: assessment?.isAbsent || false,
          isExempt: assessment?.isExempt || false,
          isPublished: assessment?.isPublished || false,
          completionStatus,
          hasData,
          lastUpdated: assessment?.updatedAt || null,
        };
      }),
    );

    // Calculate completion percentage
    const completionPercentage =
      totalStudents > 0
        ? Math.round(
            ((completeAssessments + absentStudents + exemptStudents) /
              totalStudents) *
              100,
          )
        : 0;

    return {
      success: true,
      data: {
        assessments,
        statistics: {
          totalStudents,
          studentsWithData,
          completeAssessments,
          partialAssessments,
          absentStudents,
          exemptStudents,
          studentsWithoutData: totalStudents - studentsWithData,
          completionPercentage,
        },
        classInfo: {
          className: classTerm.class.name,
          termName: classTerm.term.name,
        },
      },
    };
  } catch (error) {
    console.error("Failed to get assessments with status:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load assessments",
    };
  }
}

// Enhanced saveAssessments function with better validation and simpler create/update logic
export async function saveAssessments(
  assessments: AssessmentData[],
  termId: string,
  subjectId: string,
) {
  try {
    log.debug("\n=== SAVE ASSESSMENTS START ===");

    const { actor, user, teacherId: userTeacherId } = await authorizeAndGetUser();

    if (!user) {
      throw new Error("Authentication required");
    }

    // Validate input data
    if (!assessments || assessments.length === 0) {
      throw new Error("No assessments provided");
    }

    if (!termId || !subjectId) {
      throw new Error("Term ID and Subject ID are required");
    }

    // The school is derived from the term being written, never from the caller. This used
    // to be `authorizedSchoolId ?? schoolId` — which for a SUPER_ADMIN, whose authorized
    // value is undefined, meant trusting a schoolId straight out of the request body.
    const term = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, session: { select: { schoolId: true } } },
    });

    if (!term) {
      throw new Error("Term not found");
    }

    const effectiveSchoolId = term.session.schoolId;
    assertSchoolAccess(actor, effectiveSchoolId);

    // Loaded once for the whole batch rather than per student.
    const assessmentScheme = await loadAssessmentScheme(effectiveSchoolId);

    log.debug("Input Parameters:");
    log.debug("- termId:", termId);
    log.debug("- subjectId:", subjectId);
    log.debug("- assessments count:", assessments.length);
    log.debug("- user teacherId:", userTeacherId);

    // Validate that all required entities exist
    const [termExists, subjectExists] = await Promise.all([
      prisma.term.findFirst({
        where: {
          id: termId,
          session: { schoolId: effectiveSchoolId },
        },
        select: { id: true },
      }),
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, schoolId: true, name: true },
      }),
    ]);

    if (!termExists) {
      throw new Error("Term not found for this school");
    }

    if (!subjectExists || subjectExists.schoolId !== effectiveSchoolId) {
      throw new Error("Subject not found for this school");
    }

    // Validate all students exist
    const studentIds = [...new Set(assessments.map((a) => a.studentId))];
    const existingStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: effectiveSchoolId,
      },
      select: { id: true },
    });
    const existingStudentIds = new Set(existingStudents.map((student) => student.id));

    if (existingStudents.length !== studentIds.length) {
      const missingStudents = studentIds.filter(
        (id) => !existingStudentIds.has(id),
      );
      throw new Error(
        `Students not found for this school: ${missingStudents.join(", ")}`,
      );
    }

    // Validate all studentClassTerms exist
    const studentClassTermIds = [
      ...new Set(assessments.map((a) => a.studentClassTermId)),
    ];
    const existingStudentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        id: { in: studentClassTermIds },
        termId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        student: {
          schoolId: effectiveSchoolId,
        },
        classTerm: {
          termId,
          class: {
            schoolId: effectiveSchoolId,
          },
        },
      },
      select: { id: true, studentId: true, classTermId: true },
    });
    const existingStudentClassTermIds = new Set(
      existingStudentClassTerms.map((studentClassTerm) => studentClassTerm.id),
    );

    if (existingStudentClassTerms.length !== studentClassTermIds.length) {
      const missingIds = studentClassTermIds.filter(
        (id) => !existingStudentClassTermIds.has(id),
      );
      throw new Error(
        `Active student class terms not found for this school and term: ${missingIds.join(", ")}`,
      );
    }

    const enrollmentById = new Map(
      existingStudentClassTerms.map((studentClassTerm) => [
        studentClassTerm.id,
        studentClassTerm,
      ]),
    );

    for (const assessment of assessments) {
      const enrollment = enrollmentById.get(assessment.studentClassTermId);
      if (!enrollment || enrollment.studentId !== assessment.studentId) {
        throw new Error(
          `Student ${assessment.studentId} is not linked to enrollment ${assessment.studentClassTermId}`,
        );
      }
    }

    // Find the class term ID from the first assessment (they should all be the same)
    const firstStudentClassTerm = existingStudentClassTerms[0];
    const classTermId = firstStudentClassTerm.classTermId;

    const classTermIds = new Set(
      existingStudentClassTerms.map((studentClassTerm) => studentClassTerm.classTermId),
    );
    if (classTermIds.size !== 1) {
      throw new Error("Assessments must belong to one class term at a time");
    }

    const workflow = await prisma.classTermResultWorkflow.findUnique({
      where: { classTermId },
      select: { status: true },
    });
    if (workflow?.status === "LOCKED" || workflow?.status === "PUBLISHED") {
      throw new Error("Published or locked results must be withdrawn before scores can be edited.");
    }

    const offeredSubject = await prisma.classSubject.findFirst({
      where: { classTermId, subjectId },
      select: { id: true },
    });
    if (!offeredSubject) throw new Error("This subject is not offered by the selected class this term");

    // Find assigned teacher for this subject and class
    const teacherAssignment = await findAssignedTeacher(subjectId, classTermId);

    log.debug("Teacher assignment result:");
    log.debug("- teacherId:", teacherAssignment.teacherId);
    log.debug("- teacherName:", teacherAssignment.teacherName);
    log.debug("- isAssigned:", teacherAssignment.isAssigned);
    log.debug("- message:", teacherAssignment.message);

    // Check for existing assessments to avoid unique constraint violations
    const existingAssessments = await prisma.assessment.findMany({
      where: {
        studentId: { in: studentIds },
        subjectId,
        termId,
      },
      select: {
        id: true,
        studentId: true,
      },
    });

    log.debug(`Found ${existingAssessments.length} existing assessments`);

    // Process assessments in batches for better performance
    // One logical save is one transaction: never report failure after committing only the
    // first few students. Prisma still sends the upserts as a compact transaction batch.
    const BATCH_SIZE = assessments.length;
    const savedAssessments = [];

    for (let i = 0; i < assessments.length; i += BATCH_SIZE) {
      const batch = assessments.slice(i, i + BATCH_SIZE);
      log.debug(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, items ${i + 1} to ${Math.min(i + BATCH_SIZE, assessments.length)}`,
      );

      try {
        const batchResults = await prisma.$transaction(
          batch.map((assessment, batchIndex) => {
            const globalIndex = i + batchIndex;
            log.debug(
              `Processing assessment ${globalIndex + 1} for student ${assessment.studentId}`,
            );

            // Validate score ranges
            // Bounds come from the school's own scheme, loaded once for this save, not
            // from literals. This used to be a local validator hardcoded to CA 10/10/10
            // plus a 70-mark exam, repeated in three files.
            assertScoresWithinScheme(assessment, assessmentScheme);
            // Prepare data according to schema
            const data = {
              studentId: assessment.studentId,
              subjectId,
              termId,
              studentClassTermId: assessment.studentClassTermId,
              teacherId: teacherAssignment.teacherId, // Use the assigned teacher or null
              ca1: assessment.ca1 ?? null,
              ca2: assessment.ca2 ?? null,
              ca3: assessment.ca3 ?? null,
              exam: assessment.exam ?? null,
              isAbsent: assessment.isAbsent || false,
              isExempt: assessment.isExempt || false,
              isPublished: false,
              editedBy: user.id,
              createdBy: user.id,
            };


            // Same single upsert the teacher path uses, on the same key, so the two paths
            // can no longer disagree about which row belongs to a student and subject.
            return prisma.assessment.upsert({
              where: {
                studentId_subjectId_termId: {
                  studentId: assessment.studentId,
                  subjectId,
                  termId,
                },
              },
              update: {
                ...data,
                updatedBy: user.id,
              },
              create: {
                ...data,
              },
            });
          }),
        );

        savedAssessments.push(...batchResults);
        log.debug(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1} completed successfully`,
        );
      } catch (batchError) {
        const prismaError = batchError as {
          code?: string;
          meta?: unknown;
          message?: string;
        };
        console.error(
          `Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          batchError,
        );

        // Log the specific Prisma error details
        if (prismaError.code) {
          console.error("Prisma error code:", prismaError.code);
        }
        if (prismaError.meta) {
          console.error("Prisma error meta:", prismaError.meta);
        }
        if (prismaError.message) {
          console.error("Prisma error message:", prismaError.message);
        }

        throw new Error(
          `Failed to save batch ${Math.floor(i / BATCH_SIZE) + 1}: ${
            prismaError.message ?? "Unknown error"
          }`,
        );
      }
    }

    // Names for the audit summary. Ids are useless to whoever reads the log later.
    const auditClassTerm = await prisma.classTerm.findFirst({
      where: { students: { some: { id: { in: studentClassTermIds } } } },
      select: {
        class: { select: { name: true } },
        term: { select: { name: true } },
      },
    });
    const classTermLabel = auditClassTerm
      ? `${auditClassTerm.class.name}, ${auditClassTerm.term.name}`
      : "an unidentified class term";

    // Revalidate relevant caches
    revalidateTag(`assessments-${termId}-${subjectId}`, "max");
    revalidateTag("assessments", "max");

    log.debug(`Successfully saved ${savedAssessments.length} assessments`);
    log.debug("Teacher assignment info:", teacherAssignment.message);
    log.debug("=== SAVE ASSESSMENTS COMPLETE ===\n");

    // Recorded after the writes have succeeded, so the log never claims a save that was
    // rolled back. An audit failure is logged and swallowed — see lib/audit.ts.
    await recordAudit({
      actor,
      action: "assessment.save",
      entityType: "Assessment",
      schoolId: effectiveSchoolId,
      summary:
        `Saved ${savedAssessments.length} score${savedAssessments.length === 1 ? "" : "s"} ` +
        `for ${subjectExists.name} in ${classTermLabel}`,
      after: {
        termId,
        subjectId,
        studentCount: savedAssessments.length,
        recordedTeacherId: teacherAssignment.teacherId,
      },
    });

    return {
      success: true,
      data: savedAssessments,
      teacherInfo: {
        isAssigned: teacherAssignment.isAssigned,
        teacherName: teacherAssignment.teacherName,
        message: teacherAssignment.message,
      },
    };
  } catch (error) {
    console.error("Failed to save assessments:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Function to check teacher assignment for a subject and class (for UI feedback)
export async function checkTeacherAssignment(
  subjectId: string,
  classTermId: string,
) {
  try {
    // This had no sign-in check at all, and the score-entry screen ships its id to the
    // browser, so anyone could read teacher names and ids from any school. Same gate as score
    // entry, and only for a class in the caller's own school.
    const { actor, schoolId } = await authorizeAndGetUser();
    const classTerm = await prisma.classTerm.findFirst({
      where: { id: classTermId, ...(actor.role === "SUPER_ADMIN" ? {} : { class: { schoolId } }) },
      select: { id: true },
    });
    if (!classTerm) {
      return { success: false, error: "Class not found" };
    }
    const teacherAssignment = await findAssignedTeacher(subjectId, classTermId);
    return {
      success: true,
      data: teacherAssignment,
    };
  } catch (error) {
    console.error("Failed to check teacher assignment:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Enhanced getAssessmentsForSubject with better error handling
export async function getAssessmentsForSubject(
  termId: string,
  subjectId: string,
) {
  try {
    const { schoolId, teacherId } = await authorizeAndGetUser();

    // First, let's find all assessments for the term and subject
    const assessments = await prisma.assessment.findMany({
      where: {
        termId,
        subjectId,
        ...(teacherId && { teacherId }),
        student: {
          ...(schoolId && { schoolId }),
        },
      },
      select: {
        id: true,
        studentId: true,
        ca1: true,
        ca2: true,
        ca3: true,
        exam: true,
        isAbsent: true,
        isExempt: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        studentClassTerm: {
          select: {
            id: true,
            classTerm: {
              select: {
                id: true,
                class: {
                  select: {
                    name: true,
                  },
                },
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

    // Calculate totals and grades with error handling
    const assessmentsWithCalculations = await Promise.all(
      assessments.map(async (assessment) => {
        try {
          let totalScore = null;
          let grade = null;
          let remark = null;

          // Calculate total only if student is not absent or exempt
          if (!assessment.isAbsent && !assessment.isExempt) {
            totalScore = calculateTotalScore(
              assessment.ca1,
              assessment.ca2,
              assessment.ca3,
              assessment.exam,
            );

            if (totalScore !== null && schoolId) {
              const gradeInfo = await calculateGradeFromScore(
                totalScore,
                schoolId,
              );
              if (gradeInfo) {
                grade = gradeInfo.grade;
                remark = gradeInfo.remark;
              }
            }
          }

          return {
            id: assessment.id,
            studentId: assessment.studentId,
            ca1: assessment.ca1,
            ca2: assessment.ca2,
            ca3: assessment.ca3,
            exam: assessment.exam,
            totalScore,
            grade,
            remark,
            isAbsent: assessment.isAbsent,
            isExempt: assessment.isExempt,
            isPublished: assessment.isPublished,
          };
        } catch (error) {
          console.error(`Error processing assessment ${assessment.id}:`, error);
          return {
            id: assessment.id,
            studentId: assessment.studentId,
            ca1: assessment.ca1,
            ca2: assessment.ca2,
            ca3: assessment.ca3,
            exam: assessment.exam,
            totalScore: null,
            grade: null,
            remark: "Error",
            isAbsent: assessment.isAbsent,
            isExempt: assessment.isExempt,
            isPublished: assessment.isPublished,
          };
        }
      }),
    );

    return { success: true, data: assessmentsWithCalculations };
  } catch (error) {
    console.error("Failed to get assessments:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Bulk operations for better performance
export async function bulkUpdateAssessments(
  updates: Array<{ id: string; data: Partial<AssessmentData> }>,
  termId: string,
  subjectId: string,
) {
  try {
    const { user } = await authorizeAndGetUser();

    const results = await prisma.$transaction(
      updates.map(({ id, data }) =>
        prisma.assessment.update({
          where: { id },
          data: {
            ...data,
            editedBy: user.id,
          },
        }),
      ),
    );

    // Revalidate cache
    revalidateTag(`assessments-${termId}-${subjectId}`, "max");

    return { success: true, data: results };
  } catch (error) {
    console.error("Failed to bulk update assessments:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update assessments",
    };
  }
}
