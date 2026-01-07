"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

// Enhanced types for teacher context
interface TeacherAssessmentData {
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

// Enhanced authorization for teachers
async function authorizeTeacherAndGetData() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TEACHER") {
    throw new Error("Unauthorized: Teacher access required");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      teacher: {
        select: {
          id: true,
          schoolId: true,
          department: true,
        },
      },
    },
  });

  if (!user?.teacher) {
    throw new Error("Teacher profile not found");
  }

  return {
    userId: user.id,
    teacherId: user.teacher.id,
    schoolId: user.teacher.schoolId,
    department: user.teacher.department,
  };
}

// Get teacher's assigned class terms for a specific term
export async function getTeacherClassTerms(termId: string) {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    // Get teacher's assigned class terms for the specified term
    const teacherClassTerms = await prisma.teacherClassTerm.findMany({
      where: {
        teacherId,
        classTerm: {
          termId,
          class: {
            schoolId,
          },
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
      orderBy: {
        classTerm: {
          class: {
            name: "asc",
          },
        },
      },
    });

    const formattedClassTerms = teacherClassTerms.map((tct) => ({
      id: tct.classTerm.id,
      classId: tct.classTerm.class.id,
      className: tct.classTerm.class.name,
      classLevel: tct.classTerm.class.level,
      termId: tct.classTerm.term.id,
      termName: tct.classTerm.term.name,
    }));

    return { success: true, data: formattedClassTerms };
  } catch (error) {
    console.error("Failed to get teacher class terms:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load assigned classes",
    };
  }
}

// Get teacher's assigned subjects for a specific class term
export async function getTeacherSubjectsForClassTerm(classTermId: string) {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    // Verify teacher has access to this class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        teacherId,
        classTermId,
        classTerm: {
          class: {
            schoolId,
          },
        },
      },
    });

    if (!teacherClassTerm) {
      throw new Error("You are not assigned to this class");
    }

    // Get teacher's assigned subjects that are also offered in this class term
    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: {
        teacherId,
        subject: {
          classSubjects: {
            some: {
              classTermId,
            },
          },
        },
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
      orderBy: {
        subject: {
          name: "asc",
        },
      },
    });

    const formattedSubjects = teacherSubjects.map((ts) => ({
      id: ts.subject.id,
      name: ts.subject.name,
      code: ts.subject.code,
    }));

    return { success: true, data: formattedSubjects };
  } catch (error) {
    console.error("Failed to get teacher subjects:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load assigned subjects",
    };
  }
}

// Get students for teacher's class term
export async function getTeacherClassTermStudents(classTermId: string) {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    // Verify teacher has access to this class term
    const teacherClassTerm = await prisma.teacherClassTerm.findFirst({
      where: {
        teacherId,
        classTermId,
        classTerm: {
          class: {
            schoolId,
          },
        },
      },
    });

    if (!teacherClassTerm) {
      throw new Error("You are not assigned to this class");
    }

    // Get all students in this class term
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
                gender: true,
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

    const formattedStudents = studentClassTerms.map((sct) => ({
      id: sct.student.id,
      studentClassTermId: sct.id,
      admissionNo: sct.student.admissionNo,
      fullName: `${sct.student.user.firstName} ${sct.student.user.lastName}`,
      firstName: sct.student.user.firstName,
      lastName: sct.student.user.lastName,
      gender: sct.student.user.gender,
    }));

    return { success: true, data: formattedStudents };
  } catch (error) {
    console.error("Failed to get students for class term:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load students",
    };
  }
}

// Get teacher's assessments with status for a specific class term and subject
export async function getTeacherAssessmentsWithStatus(
  classTermId: string,
  subjectId: string,
  termId: string,
) {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    // Verify teacher has access to this class term and subject
    const [teacherClassTerm, teacherSubject] = await Promise.all([
      prisma.teacherClassTerm.findFirst({
        where: {
          teacherId,
          classTermId,
          classTerm: {
            class: {
              schoolId,
            },
          },
        },
      }),
      prisma.teacherSubject.findFirst({
        where: {
          teacherId,
          subjectId,
        },
      }),
    ]);

    if (!teacherClassTerm) {
      throw new Error("You are not assigned to this class");
    }

    if (!teacherSubject) {
      throw new Error("You are not assigned to this subject");
    }

    // Get class term information
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
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
      throw new Error("Class term not found");
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
            // Note: Removed teacherId filter to get all assessments for this student/subject/term
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
            teacherId: true,
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

              if (totalScore !== null) {
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
          totalScore,
          grade,
          remark,
          isAbsent: assessment?.isAbsent || false,
          isExempt: assessment?.isExempt || false,
          isPublished: assessment?.isPublished || false,
          completionStatus,
          hasData,
          lastUpdated: assessment?.updatedAt || null,
          teacherId: assessment?.teacherId || null, // Track which teacher created it
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
    console.error("Failed to get teacher assessments with status:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load assessments",
    };
  }
}

// Get grading system for teacher's school
const getTeacherGradingSystem = unstable_cache(
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
  ["teacher-grading-system"],
  { revalidate: 3600, tags: ["grading"] },
);

// Calculate total score helper
function calculateTotalScore(
  ca1: number | null,
  ca2: number | null,
  ca3: number | null,
  exam: number | null,
): number | null {
  const scores = [ca1, ca2, ca3, exam].filter(
    (score) => score !== null && score !== undefined,
  );
  if (scores.length === 0) return null;
  return (ca1 || 0) + (ca2 || 0) + (ca3 || 0) + (exam || 0);
}

// Calculate grade from score for teacher's school
export async function calculateGradeFromScore(
  totalScore: number | null,
  schoolId: string,
): Promise<{ grade: string; remark: string } | null> {
  if (totalScore === null || totalScore === undefined) return null;

  try {
    const gradingSystem = await getTeacherGradingSystem(schoolId);

    if (!gradingSystem?.levels || gradingSystem.levels.length === 0) {
      // Default grading system
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

// Save teacher assessments with enhanced validation and upsert logic
export async function saveTeacherAssessments(
  assessments: TeacherAssessmentData[],
  termId: string,
  subjectId: string,
  classTermId: string,
) {
  try {
    console.log("\n=== SAVE TEACHER ASSESSMENTS START ===");

    const { userId, teacherId, schoolId } = await authorizeTeacherAndGetData();

    // Validate input data
    if (!assessments || assessments.length === 0) {
      throw new Error("No assessments provided");
    }

    if (!termId || !subjectId || !classTermId) {
      throw new Error("Term ID, Subject ID, and Class Term ID are required");
    }

    console.log("Input Parameters:");
    console.log("- termId:", termId);
    console.log("- subjectId:", subjectId);
    console.log("- classTermId:", classTermId);
    console.log("- assessments count:", assessments.length);
    console.log("- teacherId:", teacherId);

    // Verify teacher has access to this class term and subject
    const [teacherClassTerm, teacherSubject] = await Promise.all([
      prisma.teacherClassTerm.findFirst({
        where: {
          teacherId,
          classTermId,
        },
      }),
      prisma.teacherSubject.findFirst({
        where: {
          teacherId,
          subjectId,
        },
      }),
    ]);

    if (!teacherClassTerm) {
      throw new Error("You are not assigned to this class");
    }

    if (!teacherSubject) {
      throw new Error("You are not assigned to this subject");
    }

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

    // Validate all students exist and belong to this class term
    const studentIds = assessments.map((a) => a.studentId);
    const validStudentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        id: { in: assessments.map((a) => a.studentClassTermId) },
        classTermId,
        student: {
          id: { in: studentIds },
        },
      },
      select: { id: true, studentId: true },
    });

    if (validStudentClassTerms.length !== assessments.length) {
      throw new Error("Some students do not belong to this class term");
    }

    // Check for existing assessments (without teacher filter to match unique constraint)
    const existingAssessments = await prisma.assessment.findMany({
      where: {
        studentId: { in: studentIds },
        subjectId,
        termId,
        // Removed teacherId filter to match unique constraint fields
      },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
      },
    });

    console.log(`Found ${existingAssessments.length} existing assessments`);

    // Process assessments in batches using upsert for better error handling
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

            // Prepare data for upsert
            const data = {
              studentId: assessment.studentId,
              subjectId,
              termId,
              studentClassTermId: assessment.studentClassTermId,
              teacherId, // Current teacher takes ownership
              ca1: assessment.ca1 ?? 0,
              ca2: assessment.ca2 ?? 0,
              ca3: assessment.ca3 ?? 0,
              exam: assessment.exam ?? 0,
              isAbsent: assessment.isAbsent || false,
              isExempt: assessment.isExempt || false,
              isPublished: false,
              editedBy: userId,
            };

            console.log(
              `Assessment data for student ${assessment.studentId}:`,
              JSON.stringify(data, null, 2),
            );

            // Use upsert to handle both create and update scenarios
            // This eliminates the unique constraint violation issue
            return prisma.assessment.upsert({
              where: {
                // Use the correct unique constraint fields including teacherId
                studentId_subjectId_termId_teacherId: {
                  studentId: assessment.studentId,
                  subjectId,
                  termId,
                  teacherId: data.teacherId,
                },
              },
              update: {
                // Update all fields and transfer ownership to current teacher
                ca1: data.ca1,
                ca2: data.ca2,
                ca3: data.ca3,
                exam: data.exam,
                isAbsent: data.isAbsent,
                isExempt: data.isExempt,
                teacherId: data.teacherId, // Transfer ownership to current teacher
                editedBy: data.editedBy,
                updatedAt: new Date(),
              },
              create: {
                ...data,
                createdBy: userId, // Add required createdBy field
              },
            });
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
        throw new Error(
          `Failed to save batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`,
        );
      }
    }

    // Revalidate relevant caches
    revalidateTag(`teacher-assessments-${teacherId}-${termId}-${subjectId}`);
    revalidateTag("teacher-assessments");

    console.log(`Successfully saved ${savedAssessments.length} assessments`);
    console.log("=== SAVE TEACHER ASSESSMENTS COMPLETE ===\n");

    return {
      success: true,
      data: savedAssessments,
      message: `Successfully saved ${savedAssessments.length} assessment${savedAssessments.length !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Failed to save teacher assessments:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Get teacher's terms (only terms where they have class assignments)
export async function getTeacherTerms() {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    const teacherClassTerms = await prisma.teacherClassTerm.findMany({
      where: {
        teacherId,
        classTerm: {
          class: {
            schoolId,
          },
        },
      },
      include: {
        classTerm: {
          include: {
            term: {
              include: {
                session: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        classTerm: {
          term: {
            session: {
              startDate: "desc",
            },
          },
        },
      },
    });

    // Remove duplicates and format
    const uniqueTerms = new Map();
    teacherClassTerms.forEach((tct) => {
      const term = tct.classTerm.term;
      if (!uniqueTerms.has(term.id)) {
        uniqueTerms.set(term.id, {
          id: term.id,
          name: term.name,
          isCurrent: term.isCurrent,
          session: {
            id: term.session.id,
            name: term.session.name,
          },
        });
      }
    });

    const terms = Array.from(uniqueTerms.values());

    return { success: true, data: terms };
  } catch (error) {
    console.error("Failed to get teacher terms:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load terms",
    };
  }
}

// Get teacher's current term
export async function getTeacherCurrentTerm() {
  try {
    const { teacherId, schoolId } = await authorizeTeacherAndGetData();

    const currentTerm = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        session: {
          schoolId,
        },
        classTerms: {
          some: {
            teachers: {
              some: {
                teacherId,
              },
            },
          },
        },
      },
      include: {
        session: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { success: true, data: currentTerm };
  } catch (error) {
    console.error("Failed to get teacher current term:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load current term",
    };
  }
}

// Get teacher profile with school info
export async function getTeacherProfile() {
  try {
    const { userId, teacherId, schoolId } = await authorizeTeacherAndGetData();

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new Error("Teacher profile not found");
    }

    return {
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          staffId: teacher.staffId,
          department: teacher.department,
          qualification: teacher.qualification,
          user: teacher.user,
        },
        school: teacher.school,
      },
    };
  } catch (error) {
    console.error("Failed to get teacher profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load profile",
    };
  }
}
