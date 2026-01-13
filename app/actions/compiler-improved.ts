"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

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

// Enhanced authorization with better error handling
async function authorizeAndGetUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      admin: { select: { schoolId: true } },
      teacher: { select: { id: true, schoolId: true } },
      superAdmin: true,
    },
  });

  if (!user) {
    throw new Error("User profile not found");
  }

  let schoolId: string | undefined;
  let teacherId: string | undefined;

  if (user.admin?.schoolId) {
    schoolId = user.admin.schoolId;
  } else if (user.teacher) {
    schoolId = user.teacher.schoolId;
    teacherId = user.teacher.id;
  } else if (user.superAdmin) {
    schoolId = undefined;
  } else {
    throw new Error("User does not have permission to access this resource");
  }

  return { user, schoolId, teacherId, role: user.role };
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
    console.log(
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
      console.log(
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
      console.log(
        `Found class teacher ${teacherClassTerm.teacher.id} (${teacherName}) for class term ${classTermId}`,
      );
      return {
        teacherId: teacherClassTerm.teacher.id,
        teacherName,
        isAssigned: true,
        message: `Class teacher: ${teacherName} (no specific subject assignment)`,
      };
    }

    console.log(
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
const getGradingSystem = unstable_cache(
  async (schoolId: string) => {
    try {
      const gradingSystem = await prisma.gradingSystem.findFirst({
        where: {
          schoolId,
          isDefault: true,
        },
        include: {
          levels: {
            orderBy: { minScore: "desc" },
          },
        },
      });

      return gradingSystem;
    } catch (error) {
      console.error("Error fetching grading system:", error);
      return null;
    }
  },
  ["grading-system"],
  { revalidate: 3600, tags: ["grading"] },
);

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
export async function calculateGradeFromScore(
  totalScore: number | null,
  schoolId: string,
): Promise<{ grade: string; remark: string } | null> {
  if (totalScore === null || totalScore === undefined) return null;

  try {
    const gradingSystem = await getGradingSystem(schoolId);

    if (!gradingSystem?.levels || gradingSystem.levels.length === 0) {
      // Enhanced default grading system
      if (totalScore >= 80) return { grade: "A1", remark: "Excellent" };
      if (totalScore >= 70) return { grade: "A2", remark: "Very Good" };
      if (totalScore >= 60) return { grade: "B1", remark: "Good" };
      if (totalScore >= 50) return { grade: "B2", remark: "Fair" };
      if (totalScore >= 45) return { grade: "C1", remark: "Pass" };
      if (totalScore >= 40) return { grade: "C2", remark: "Weak Pass" };
      return { grade: "F", remark: "Fail" };
    }

    const level = gradingSystem.levels.find(
      (l) => totalScore >= l.minScore && totalScore <= l.maxScore,
    );

    return level
      ? { grade: level.grade, remark: level.remark }
      : { grade: "F", remark: "Fail" };
  } catch (error) {
    console.error("Error calculating grade:", error);
    return { grade: "F", remark: "Error" };
  }
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
  schoolId: string,
) {
  try {
    console.log("\n=== SAVE ASSESSMENTS START ===");

    const { user, teacherId: userTeacherId } = await authorizeAndGetUser();

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

    console.log("Input Parameters:");
    console.log("- termId:", termId);
    console.log("- subjectId:", subjectId);
    console.log("- schoolId:", schoolId);
    console.log("- assessments count:", assessments.length);
    console.log("- user teacherId:", userTeacherId);

    // Validate that all required entities exist
    const [termExists, subjectExists] = await Promise.all([
      prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true },
      }),
    ]);

    if (!termExists) {
      throw new Error(`Term with ID ${termId} not found`);
    }

    if (!subjectExists) {
      throw new Error(`Subject with ID ${subjectId} not found`);
    }

    // Validate all students exist
    const studentIds = assessments.map((a) => a.studentId);
    const existingStudents = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true },
    });

    if (existingStudents.length !== studentIds.length) {
      const missingStudents = studentIds.filter(
        (id) => !existingStudents.find((s) => s.id === id),
      );
      throw new Error(`Students not found: ${missingStudents.join(", ")}`);
    }

    // Validate all studentClassTerms exist
    const studentClassTermIds = assessments.map((a) => a.studentClassTermId);
    const existingStudentClassTerms = await prisma.studentClassTerm.findMany({
      where: { id: { in: studentClassTermIds } },
      select: { id: true, classTermId: true },
    });

    if (existingStudentClassTerms.length !== studentClassTermIds.length) {
      const missingIds = studentClassTermIds.filter(
        (id) => !existingStudentClassTerms.find((sct) => sct.id === id),
      );
      throw new Error(
        `Student class terms not found: ${missingIds.join(", ")}`,
      );
    }

    // Find the class term ID from the first assessment (they should all be the same)
    const firstStudentClassTerm = existingStudentClassTerms[0];
    const classTermId = firstStudentClassTerm.classTermId;

    // Find assigned teacher for this subject and class
    const teacherAssignment = await findAssignedTeacher(subjectId, classTermId);

    console.log("Teacher assignment result:");
    console.log("- teacherId:", teacherAssignment.teacherId);
    console.log("- teacherName:", teacherAssignment.teacherName);
    console.log("- isAssigned:", teacherAssignment.isAssigned);
    console.log("- message:", teacherAssignment.message);

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

    console.log(`Found ${existingAssessments.length} existing assessments`);

    // Process assessments in batches for better performance
    const BATCH_SIZE = 5;
    const savedAssessments = [];

    for (let i = 0; i < assessments.length; i += BATCH_SIZE) {
      const batch = assessments.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, items ${i + 1} to ${Math.min(i + BATCH_SIZE, assessments.length)}`,
      );

      try {
        const batchResults = await prisma.$transaction(
          batch.map((assessment, batchIndex) => {
            const globalIndex = i + batchIndex;
            console.log(
              `Processing assessment ${globalIndex + 1} for student ${assessment.studentId}`,
            );

            // Validate score ranges
            const validateScore = (
              score: number | null | undefined,
              field: string,
              max: number,
            ) => {
              if (score !== null && score !== undefined) {
                if (score < 0 || score > max) {
                  throw new Error(
                    `${field} score must be between 0 and ${max}, got ${score}`,
                  );
                }
              }
            };

            validateScore(assessment.ca1, "CA1", 10);
            validateScore(assessment.ca2, "CA2", 10);
            validateScore(assessment.ca3, "CA3", 10);
            validateScore(assessment.exam, "Exam", 70);

            // Prepare data according to schema
            const data = {
              studentId: assessment.studentId,
              subjectId,
              termId,
              studentClassTermId: assessment.studentClassTermId,
              teacherId: teacherAssignment.teacherId, // Use the assigned teacher or null
              ca1: assessment.ca1 ?? 0, // Default to 0 instead of null
              ca2: assessment.ca2 ?? 0, // Default to 0 instead of null
              ca3: assessment.ca3 ?? 0, // Default to 0 instead of null
              exam: assessment.exam ?? 0, // Default to 0 instead of null
              isAbsent: assessment.isAbsent || false,
              isExempt: assessment.isExempt || false,
              isPublished: false,
              editedBy: user.id,
              createdBy: user.id,
            };

            console.log(
              `Assessment data for student ${assessment.studentId}:`,
              JSON.stringify(data, null, 2),
            );

            // Check if this is an update or create operation
            const existingAssessment = existingAssessments.find(
              (ea) => ea.studentId === assessment.studentId,
            );

            if (assessment.id || existingAssessment) {
              const assessmentId = assessment.id || existingAssessment?.id;
              console.log(`Updating existing assessment ${assessmentId}`);
              return prisma.assessment.update({
                where: { id: assessmentId },
                data: {
                  ...data,
                  updatedBy: user.id,
                },
              });
            } else {
              console.log(
                `Creating new assessment for student ${assessment.studentId}`,
              );
              // Use simple create instead of upsert to avoid relationship issues
              return prisma.assessment.create({
                data: {
                  ...data,
                },
              });
            }
          }),
        );

        savedAssessments.push(...batchResults);
        console.log(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1} completed successfully`,
        );
      } catch (batchError) {
        console.error(
          `Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          batchError,
        );

        // Log the specific Prisma error details
        if (batchError.code) {
          console.error("Prisma error code:", batchError.code);
        }
        if (batchError.meta) {
          console.error("Prisma error meta:", batchError.meta);
        }
        if (batchError.message) {
          console.error("Prisma error message:", batchError.message);
        }

        throw new Error(
          `Failed to save batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`,
        );
      }
    }

    // Revalidate relevant caches
    revalidateTag(`assessments-${termId}-${subjectId}`);
    revalidateTag("assessments");

    console.log(`Successfully saved ${savedAssessments.length} assessments`);
    console.log("Teacher assignment info:", teacherAssignment.message);
    console.log("=== SAVE ASSESSMENTS COMPLETE ===\n");

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
    revalidateTag(`assessments-${termId}-${subjectId}`);

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
