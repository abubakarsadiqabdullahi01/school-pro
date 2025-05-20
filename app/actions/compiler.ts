"use server"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import type { ClassLevel } from "@prisma/client"

// Interface for assessment input to ensure type safety
interface AssessmentInput {
  id?: string;
  classTermId: string;
  subjectId: string;
  studentId: string;
  studentClassTermId: string;
  ca1Score?: number;
  ca2Score?: number;
  ca3Score?: number;
  examScore?: number;
  grade?: string;
}

// Reusable authorization function
async function authorizeAndGetSchoolId(): Promise<string | undefined> {
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized");
  }
  if (session.user.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
      select: { schoolId: true },
    });
    if (!admin?.schoolId) {
      throw new Error("Admin not assigned to a school");
    }
    return admin.schoolId;
  }
  return undefined;
}

// Get classes for a specific term and level
export async function getClassesForTerm(termId: string, level: ClassLevel) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Get the term to verify it belongs to the admin's school
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: {
        session: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!term) {
      throw new Error("Term not found");
    }

    // If admin, verify the term belongs to their school
    if (schoolId && term.session.schoolId !== schoolId) {
      throw new Error("Term does not belong to admin's school");
    }

    // Get all classes for the term and level
    const classTerms = await prisma.classTerm.findMany({
      where: {
        termId,
        class: {
          level,
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
        teachers: {
          take: 1,
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
        },
      },
    });

    // Format the response
    const formattedClasses = classTerms.map((classTerm) => {
      const teacher = classTerm.teachers[0]?.teacher;
      const teacherName = teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null;

      return {
        id: classTerm.class.id,
        name: classTerm.class.name,
        level: classTerm.class.level,
        classTermId: classTerm.id,
        teacherId: teacher?.id || null,
        teacherName,
      };
    });

    return { success: true, data: formattedClasses };
  } catch (error) {
    console.error("Failed to get classes for term:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get students for a specific class term
export async function getStudentsForClassTerm(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Get the class term to verify it belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!classTerm) {
      throw new Error("Class term not found");
    }

    // If admin, verify the class belongs to their school
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school");
    }

    // Get all students for the class term
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
      },
    });

    // Format the response
    const formattedStudents = studentClassTerms.map((studentClassTerm) => {
      return {
        id: studentClassTerm.student.id,
        studentClassTermId: studentClassTerm.id,
        admissionNo: studentClassTerm.student.admissionNo,
        fullName: `${studentClassTerm.student.user.firstName} ${studentClassTerm.student.user.lastName}`,
      };
    });

    return { success: true, data: formattedStudents };
  } catch (error) {
    console.error("Failed to get students for class term:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get subjects for a specific class term
export async function getSubjectsForClassTerm(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Get the class term to verify it belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!classTerm) {
      throw new Error("Class term not found");
    }

    // If admin, verify the class belongs to their school
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school");
    }

    // Get all class subjects for the class term
    const classSubjects = await prisma.classSubject.findMany({
      where: {
        classTermId,
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
    });

    // Format the response
    const formattedSubjects = classSubjects.map((classSubject) => {
      return {
        id: classSubject.subject.id,
        name: classSubject.subject.name,
        code: classSubject.subject.code,
        classSubjectId: classSubject.id,
      };
    });

    return { success: true, data: formattedSubjects };
  } catch (error) {
    console.error("Failed to get subjects for class term:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Get assessments for a specific subject
export async function getAssessmentsForSubject(classTermId: string, subjectId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId();

    // Get the class term to verify it belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!classTerm) {
      throw new Error("Class term not found");
    }

    // If admin, verify the class belongs to their school
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school");
    }

    // Find the class subject
    const classSubject = await prisma.classSubject.findFirst({
      where: {
        classTermId,
        subjectId,
      },
    });

    if (!classSubject) {
      throw new Error("Subject not assigned to this class");
    }

    // Get all assessments for the subject
    const assessments = await prisma.assessment.findMany({
      where: {
        classSubjectId: classSubject.id,
      },
      include: {
        student: {
          select: {
            id: true,
          },
        },
      },
    });

    // Format the response
    const formattedAssessments = assessments.map((assessment) => {
      return {
        id: assessment.id,
        studentId: assessment.student.id,
        ca1Score: assessment.ca1Score,
        ca2Score: assessment.ca2Score,
        ca3Score: assessment.ca3Score,
        caScore: assessment.caScore,
        examScore: assessment.examScore,
        totalScore: assessment.totalScore,
        grade: assessment.grade,
      };
    });

    return { success: true, data: formattedAssessments };
  } catch (error) {
    console.error("Failed to get assessments for subject:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

// Save assessments
export async function saveAssessments(assessments: {
  id?: string
  studentId: string
  studentClassTermId: string
  classTermId: string
  subjectId: string
  ca1Score: number | null
  ca2Score: number | null
  ca3Score: number | null
  examScore: number | null
  totalScore: number | null
  grade: string | null
}[]) {
  try {
    // Fetch classSubjects to validate
    const classSubjects = await prisma.classSubject.findMany({
      where: {
        classTermId: { in: assessments.map((a) => a.classTermId) },
        subjectId: { in: assessments.map((a) => a.subjectId) },
      },
    })

    const classSubjectMap = new Map(
      classSubjects.map((cs) => [`${cs.classTermId}-${cs.subjectId}`, cs])
    )

    const savedAssessments = await prisma.$transaction(
      assessments.map((assessment) => {
        console.log("Validating assessment:", {
          classTermId: assessment.classTermId,
          subjectId: assessment.subjectId,
        })
        const classSubject = classSubjectMap.get(`${assessment.classTermId}-${assessment.subjectId}`)
        if (!classSubject) {
          console.error("Subject not assigned:", {
            classTermId: assessment.classTermId,
            subjectId: assessment.subjectId,
            availableClassSubjects: Array.from(classSubjectMap.keys()),
          })
          throw new Error(`Subject ${assessment.subjectId} not assigned to class term ${assessment.classTermId}`)
        }

        // ... rest of the assessment saving logic
        return prisma.assessment.upsert({
          where: { id: assessment.id || "" },
          update: {
            ca1Score: assessment.ca1Score,
            ca2Score: assessment.ca2Score,
            ca3Score: assessment.ca3Score,
            examScore: assessment.examScore,
            totalScore: assessment.totalScore,
            grade: assessment.grade,
          },
          create: {
            studentId: assessment.studentId,
            studentClassTermId: assessment.studentClassTermId,
            classTermId: assessment.classTermId,
            subjectId: assessment.subjectId,
            ca1Score: assessment.ca1Score,
            ca2Score: assessment.ca2Score,
            ca3Score: assessment.ca3Score,
            examScore: assessment.examScore,
            totalScore: assessment.totalScore,
            grade: assessment.grade,
          },
        })
      })
    )

    return { success: true, data: savedAssessments }
  } catch (error) {
    console.error("Error in saveAssessments:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}