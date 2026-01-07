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

// Enhanced authorization for teachers
async function authorizeTeacherAndGetUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  if (session.user.role !== "TEACHER") {
    throw new Error("Teacher access required");
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      school: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!teacher) {
    throw new Error("Teacher profile not found");
  }

  return { teacher, schoolId: teacher.schoolId, role: session.user.role };
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

// Get subjects assigned to the current teacher
export async function getTeacherSubjects() {
  try {
    const { teacher } = await authorizeTeacherAndGetUser();

    // Get current term for the teacher's school
    const currentTerm = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        session: {
          schoolId: teacher.schoolId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!currentTerm) {
      return {
        success: true,
        data: [],
        message: "No current term active",
      };
    }

    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: {
        teacherId: teacher.id,
        termId: currentTerm.id, // Filter by current term only
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        term: {
          select: {
            id: true,
            name: true,
            isCurrent: true,
          },
        },
      },
      orderBy: {
        subject: {
          name: "asc",
        },
      },
    });

    const subjects = teacherSubjects.map((ts) => ({
      id: ts.subject.id,
      name: ts.subject.name,
      code: ts.subject.code,
    }));

    return {
      success: true,
      data: subjects,
    };
  } catch (error) {
    console.error("Failed to get teacher subjects:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load subjects",
      data: [],
    };
  }
}

// Get classes that a teacher teaches for a specific subject and term
export async function getTeacherClassesForSubject(
  termId: string,
  subjectId: string,
) {
  try {
    const { teacher } = await authorizeTeacherAndGetUser();

    // Find classes where the teacher is assigned to teach this subject
    const teacherClassTerms = await prisma.teacherClassTerm.findMany({
      where: {
        teacherId: teacher.id,
        classTerm: {
          termId: termId,
        },
      },
      include: {
        classTerm: {
          include: {
            class: {
              select: {
                id: true,
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
          },
        },
      },
    });

    // Verify the teacher teaches this subject for the specified term
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: subjectId,
        termId: termId, // Verify assignment for this specific term
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject for this term",
        data: [],
      };
    }

    const classes = teacherClassTerms.map((tct) => ({
      classTermId: tct.classTerm.id,
      id: tct.classTerm.class.id,
      name: tct.classTerm.class.name,
      level: tct.classTerm.class.level,
      termName: tct.classTerm.term.name,
    }));

    return {
      success: true,
      data: classes,
    };
  } catch (error) {
    console.error("Failed to get teacher classes for subject:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load classes",
      data: [],
    };
  }
}

// Get students for a specific class term that the teacher teaches
export async function getStudentsForTeacherClass(classTermId: string) {
  try {
    const { teacher } = await authorizeTeacherAndGetUser();

    // Verify the teacher is assigned to this class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        teacherId: teacher.id,
        classTermId: classTermId,
      },
    });

    if (!teacherClassTerm) {
      return {
        success: false,
        error: "You are not assigned to teach this class",
        data: [],
      };
    }

    // Get all students in this class term
    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        classTermId: classTermId,
        status: "ACTIVE",
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
      },
      orderBy: {
        student: {
          user: {
            firstName: "asc",
          },
        },
      },
    });

    const students = studentClassTerms.map((sct) => ({
      id: sct.student.id,
      admissionNo: sct.student.admissionNo,
      fullName: `${sct.student.user.firstName} ${sct.student.user.lastName}`,
    }));

    return {
      success: true,
      data: students,
    };
  } catch (error) {
    console.error("Failed to get students for teacher class:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load students",
      data: [],
    };
  }
}

// Enhanced function to get assessments with completion status for a class term and subject (teacher version)
export async function getAssessmentsWithStatus(
  classTermId: string,
  subjectId: string,
  termId: string,
) {
  try {
    const { teacher, schoolId } = await authorizeTeacherAndGetUser();

    // Verify the teacher is assigned to this class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        teacherId: teacher.id,
        classTermId: classTermId,
      },
    });

    if (!teacherClassTerm) {
      return {
        success: false,
        error: "You are not assigned to teach this class",
      };
    }

    // Verify the teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: subjectId,
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject",
      };
    }

    // Get the class term info
    const classTerm = await prisma.classTerm.findFirst({
      where: {
        id: classTermId,
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
        error: "Class term not found",
      };
    }

    // Get all student class terms for this class term
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
              },
            },
          },
        },
        assessments: {
          where: {
            subjectId,
            termId,
            teacherId: teacher.id, // Only assessments by this teacher
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

// Enhanced saveAssessments function for teachers
export async function saveAssessments(
  assessments: AssessmentData[],
  termId: string,
  subjectId: string,
  classTermId: string,
) {
  try {
    console.log("\n=== TEACHER SAVE ASSESSMENTS START ===");

    const { teacher, schoolId } = await authorizeTeacherAndGetUser();

    // Validate that teacher is assigned to this class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        teacherId: teacher.id,
        classTermId: classTermId,
      },
    });

    if (!teacherClassTerm) {
      throw new Error("You are not assigned to teach this class");
    }

    // Validate that teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: subjectId,
      },
    });

    if (!teacherSubject) {
      throw new Error("You are not assigned to teach this subject");
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
    console.log("- classTermId:", classTermId);
    console.log("- teacherId:", teacher.id);
    console.log("- assessments count:", assessments.length);

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

    // Validate all students exist and belong to the class
    const studentIds = assessments.map((a) => a.studentId);
    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        studentId: { in: studentIds },
        classTermId: classTermId,
        status: "ACTIVE",
      },
      include: {
        student: { select: { id: true } },
      },
    });

    if (studentClassTerms.length !== studentIds.length) {
      const foundStudentIds = studentClassTerms.map((sct) => sct.student.id);
      const missingStudents = studentIds.filter(
        (id) => !foundStudentIds.includes(id),
      );
      throw new Error(
        `Students not found in this class: ${missingStudents.join(", ")}`,
      );
    }

    // Check for existing assessments to avoid unique constraint violations
    const existingAssessments = await prisma.assessment.findMany({
      where: {
        studentId: { in: studentIds },
        subjectId,
        termId,
        teacherId: teacher.id,
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
              teacherId: teacher.id,
              ca1: assessment.ca1 ?? 0,
              ca2: assessment.ca2 ?? 0,
              ca3: assessment.ca3 ?? 0,
              exam: assessment.exam ?? 0,
              isAbsent: assessment.isAbsent || false,
              isExempt: assessment.isExempt || false,
              isPublished: false,
              editedBy: teacher.userId,
              createdBy: teacher.userId,
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
                  updatedBy: teacher.userId,
                },
              });
            } else {
              console.log(
                `Creating new assessment for student ${assessment.studentId}`,
              );
              return prisma.assessment.create({
                data: {
                  ...data,
                  createdBy: teacher.userId,
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
    console.log("=== TEACHER SAVE ASSESSMENTS COMPLETE ===\n");

    return {
      success: true,
      data: savedAssessments,
      teacherInfo: {
        isAssigned: true,
        teacherName: `${teacher.user.firstName} ${teacher.user.lastName}`,
        message: `Assessments saved by ${teacher.user.firstName} ${teacher.user.lastName}`,
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

// Enhanced getAssessmentsForSubject with teacher authorization
export async function getAssessmentsForSubject(
  termId: string,
  subjectId: string,
  classTermId?: string,
) {
  try {
    const { teacher, schoolId } = await authorizeTeacherAndGetUser();

    // Verify teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: subjectId,
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject",
      };
    }

    // Build where clause
    const whereClause: any = {
      termId,
      subjectId,
      teacherId: teacher.id,
    };

    // If classTermId is provided, filter by it
    if (classTermId) {
      // Verify teacher is assigned to this class term
      const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
        where: {
          teacherId: teacher.id,
          classTermId: classTermId,
        },
      });

      if (!teacherClassTerm) {
        return {
          success: false,
          error: "You are not assigned to teach this class",
        };
      }

      whereClause.studentClassTerm = {
        classTermId: classTermId,
      };
    }

    // Find assessments for the term and subject
    const assessments = await prisma.assessment.findMany({
      where: whereClause,
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
        student: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            admissionNo: true,
          },
        },
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
            studentName: `${assessment.student.user.firstName} ${assessment.student.user.lastName}`,
            admissionNo: assessment.student.admissionNo,
            className: assessment.studentClassTerm.classTerm.class.name,
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
            studentName: `${assessment.student.user.firstName} ${assessment.student.user.lastName}`,
            admissionNo: assessment.student.admissionNo,
            className: assessment.studentClassTerm.classTerm.class.name,
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

// Bulk operations for better performance (teacher version)
export async function bulkUpdateAssessments(
  updates: Array<{ id: string; data: Partial<AssessmentData> }>,
  termId: string,
  subjectId: string,
) {
  try {
    const { teacher } = await authorizeTeacherAndGetUser();

    // Verify teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: subjectId,
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject",
      };
    }

    // Verify all assessments belong to this teacher
    const assessmentIds = updates.map((u) => u.id);
    const existingAssessments = await prisma.assessment.findMany({
      where: {
        id: { in: assessmentIds },
        teacherId: teacher.id,
      },
      select: { id: true },
    });

    if (existingAssessments.length !== assessmentIds.length) {
      return {
        success: false,
        error: "Some assessments do not belong to you",
      };
    }

    const results = await prisma.$transaction(
      updates.map(({ id, data }) =>
        prisma.assessment.update({
          where: { id },
          data: {
            ...data,
            editedBy: teacher.userId,
            updatedBy: teacher.userId,
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
