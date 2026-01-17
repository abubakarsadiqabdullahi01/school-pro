"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Gender } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ============================================
// AUTHENTICATION HELPER
// ============================================
async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: No authenticated user");
  }

  // Get the admin's school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true, userId: true },
  });

  if (!admin || !admin.schoolId) {
    throw new Error("Unauthorized: Admin not assigned to a school");
  }

  return { userId: session.user.id, schoolId: admin.schoolId };
}

// ============================================
// CREATE STUDENT
// ============================================
export async function createStudent(data: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: Gender;
  state?: string;
  lga?: string;
  address?: string;
  phone?: string;
  classId?: string;
  termId?: string;
  year: number;
  parentId?: string;
  relationship?: string;
  isActive?: boolean;
  createLoginCredentials?: boolean;
}) {
  try {
    const { userId, schoolId } = await getAuthenticatedUser();

    // Generate admission number
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        admissionPrefix: true,
        admissionFormat: true,
        admissionSequenceStart: true,
      },
    });

    if (!school) {
      return { success: false, error: "School not found" };
    }

    // Validate required fields for class assignment
    if (!data.classId || !data.termId) {
      return { success: false, error: "Class and Term are required" };
    }

    // ============================================
    // GENERATE ADMISSION NUMBER (SAFE)
    // ============================================
    let admissionNo!: string;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const admissionSequence = await prisma.admissionSequence.upsert({
          where: {
            schoolId_year: {
              schoolId,
              year: data.year,
            },
          },
          update: {
            lastSequence: {
              increment: 1,
            },
          },
          create: {
            schoolId,
            year: data.year,
            lastSequence: school.admissionSequenceStart,
          },
        });

        admissionNo = school.admissionFormat
          .replace("{PREFIX}", school.admissionPrefix)
          .replace("{YEAR}", data.year.toString())
          .replace(
            "{NUMBER}",
            admissionSequence.lastSequence.toString().padStart(4, "0"),
          );

        break; // ✅ success, exit loop
      } catch (e: any) {
        // Retry ONLY on duplicate admission number
        if (e.code !== "P2002") {
          throw e;
        }
      }
    }

    if (!admissionNo) {
      throw new Error("Failed to generate unique admission number");
    }

    // Create user and student in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create User
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          role: "STUDENT",
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          state: data.state || "Not Specified",
          lga: data.lga || "Not Specified",
          address: data.address || "Not Specified",
          phone: data.phone || "",
          isActive: data.isActive ?? true,
        },
      });

      // Create Student
      const student = await tx.student.create({
        data: {
          userId: user.id,
          schoolId,
          admissionNo,
          year: data.year,
        },
      });

      // Create login credentials if requested
      if (data.createLoginCredentials) {
        const defaultPassword = `${data.firstName.toLowerCase()}${data.year}`;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        await tx.credential.create({
          data: {
            userId: user.id,
            type: "REGISTRATION_NUMBER",
            value: admissionNo,
            passwordHash: hashedPassword,
            isPrimary: true,
          },
        });
      }

      // Link parent if provided
      if (data.parentId) {
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: data.parentId,
            relationship: data.relationship || "PARENT",
          },
        });
      }

      // ============================================
      // CRITICAL FIX: ENROLL IN CLASS
      // ============================================
      console.log(
        "Enrolling student with classId:",
        data.classId,
        "termId:",
        data.termId,
      );

      // First, get or create the ClassTerm
      let classTerm = await tx.classTerm.findFirst({
        where: {
          classId: data.classId,
          termId: data.termId,
        },
      });

      // If ClassTerm doesn't exist, create it
      if (!classTerm) {
        console.log("ClassTerm not found, creating new one...");
        classTerm = await tx.classTerm.create({
          data: {
            classId: data.classId,
            termId: data.termId,
          },
        });
      }

      if (classTerm) {
        console.log("Found/Created ClassTerm:", classTerm.id);

        // Create StudentClassTerm enrollment
        await tx.studentClassTerm.create({
          data: {
            studentId: student.id,
            classTermId: classTerm.id,
            termId: data.termId,
            status: "ACTIVE",
          },
        });

        // Log enrollment history
        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: student.id,
            classTermId: classTerm.id,
            termId: data.termId,
            action: "ENROLLED",
            createdBy: userId,
          },
        });

        console.log("Student enrolled successfully!");
      } else {
        console.error("Failed to create/find ClassTerm");
      }

      return { user, student, admissionNo, classTerm };
    });

    revalidatePath("/dashboard/admin/students");

    return {
      success: true,
      data: {
        id: result.student.id,
        userId: result.user.id,
        admissionNo: result.admissionNo,
        classTermId: result.classTerm?.id,
      },
    };
  } catch (error: any) {
    console.error("Error creating student:", error);
    return {
      success: false,
      error: error.message || "Failed to create student",
    };
  }
}

// ============================================
// UPDATE STUDENT
// ============================================
// app/actions/student-management.ts
export async function updateStudent(input: {
  studentId: string;
  data: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    gender?: Gender;
    state?: string;
    lga?: string;
    address?: string;
    phone?: string;
    classId?: string;
    termId?: string;
    year?: number;
    isActive?: boolean;
  };
}) {
  const { studentId, data } = input;

  if (!studentId || typeof studentId !== "string") {
    return { success: false, error: "Invalid student ID" };
  }

  try {
    const { userId, schoolId } = await getAuthenticatedUser();

    // Get current student data
    const existingStudent = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        classTerms: {
          where: { status: "ACTIVE" },
          include: { classTerm: true },
        },
      },
    });

    if (!existingStudent) {
      return { success: false, error: "Student not found" };
    }

    // Verify school ownership
    if (existingStudent.schoolId !== schoolId) {
      return {
        success: false,
        error: "Unauthorized: Student belongs to different school",
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update User data
      const updatedUser = await tx.user.update({
        where: { id: existingStudent.userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth
            ? new Date(data.dateOfBirth)
            : undefined,
          gender: data.gender,
          state: data.state,
          lga: data.lga,
          address: data.address,
          phone: data.phone,
          isActive: data.isActive,
        },
      });

      // Update Student data
      const updatedStudent = await tx.student.update({
        where: { id: studentId },
        data: {
          year: data.year,
        },
      });

      // Handle class change if classId and termId are provided
      if (data.classId && data.termId) {
        // Get the new ClassTerm
        const newClassTerm = await tx.classTerm.findFirst({
          where: {
            classId: data.classId,
            termId: data.termId,
          },
        });

        if (newClassTerm) {
          const currentEnrollment = existingStudent.classTerms[0];

          // Check if class is actually changing
          if (
            !currentEnrollment ||
            currentEnrollment.classTermId !== newClassTerm.id
          ) {
            // Deactivate old enrollment if exists
            if (currentEnrollment) {
              await tx.studentClassTerm.update({
                where: { id: currentEnrollment.id },
                data: { status: "TRANSFERRED" },
              });

              // Log transfer in enrollment history
              await tx.studentEnrollmentHistory.create({
                data: {
                  studentId: studentId,
                  classTermId: newClassTerm.id,
                  termId: data.termId,
                  action: "TRANSFERRED",
                  previousClassTermId: currentEnrollment.classTermId,
                  reason: "Class change via student edit",
                  createdBy: userId,
                },
              });

              // Log transition
              await tx.studentTransition.create({
                data: {
                  studentId: studentId,
                  fromClassTermId: currentEnrollment.classTermId,
                  toClassTermId: newClassTerm.id,
                  transitionType: "TRANSFER",
                  notes: "Transferred via student edit form",
                  createdBy: userId,
                },
              });
            }

            // Create or update new enrollment
            await tx.studentClassTerm.upsert({
              where: {
                studentId_classTermId: {
                  studentId: studentId,
                  classTermId: newClassTerm.id,
                },
              },
              update: {
                status: "ACTIVE",
              },
              create: {
                studentId: studentId,
                classTermId: newClassTerm.id,
                termId: data.termId,
                status: "ACTIVE",
              },
            });

            // Log new enrollment if no previous enrollment
            if (!currentEnrollment) {
              await tx.studentEnrollmentHistory.create({
                data: {
                  studentId: studentId,
                  classTermId: newClassTerm.id,
                  termId: data.termId,
                  action: "ENROLLED",
                  createdBy: userId,
                },
              });
            }
          }
        }
      }

      return { user: updatedUser, student: updatedStudent };
    });

    revalidatePath("/dashboard/admin/students");
    revalidatePath(`/dashboard/admin/students/${studentId}`);

    return {
      success: true,
      data: result,
      message: "Student updated successfully",
    };
  } catch (error: any) {
    console.error("Error updating student:", error);
    return {
      success: false,
      error: error.message || "Failed to update student",
    };
  }
}

// ============================================
// DELETE STUDENT (NEW - PROPER IMPLEMENTATION)
// ============================================
export async function deleteStudent(studentId: string) {
  try {
    const { schoolId } = await getAuthenticatedUser();

    // Get student with all related data
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        assessments: true,
        payments: true,
        attendances: true,
      },
    });

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    // Verify school ownership
    if (student.schoolId !== schoolId) {
      return {
        success: false,
        error: "Unauthorized: Student belongs to different school",
      };
    }

    // Check if student has critical data (assessments, payments)
    const hasAssessments = student.assessments.length > 0;
    const hasPayments = student.payments.length > 0;

    if (hasAssessments || hasPayments) {
      // Instead of hard delete, perform soft delete
      await prisma.user.update({
        where: { id: student.userId },
        data: {
          isActive: false,
          // Mark as archived
          state: `ARCHIVED_${student.user.state}`,
        },
      });

      revalidatePath("/dashboard/admin/students");

      return {
        success: true,
        message: "Student archived (has academic/payment records)",
        isArchived: true,
      };
    }

    // If no critical data, perform hard delete
    await prisma.$transaction(async (tx) => {
      // Delete related records in correct order
      await tx.studentParent.deleteMany({ where: { studentId } });
      await tx.studentClassTerm.deleteMany({ where: { studentId } });
      await tx.studentEnrollmentHistory.deleteMany({ where: { studentId } });
      await tx.studentTransition.deleteMany({ where: { studentId } });
      await tx.attendance.deleteMany({ where: { studentId } });

      // Delete student
      await tx.student.delete({ where: { id: studentId } });

      // Delete user and credentials (cascade should handle this, but explicit is safer)
      await tx.credential.deleteMany({ where: { userId: student.userId } });
      await tx.user.delete({ where: { id: student.userId } });
    });

    revalidatePath("/dashboard/admin/students");

    return {
      success: true,
      message: "Student deleted successfully",
      isArchived: false,
    };
  } catch (error: any) {
    console.error("Error deleting student:", error);
    return {
      success: false,
      error: error.message || "Failed to delete student",
    };
  }
}

// ============================================
// TOGGLE STUDENT STATUS (ACTIVATE/DEACTIVATE)
// ============================================
export async function toggleStudentStatus(studentId: string) {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    if (student.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized" };
    }

    const updatedUser = await prisma.user.update({
      where: { id: student.userId },
      data: {
        isActive: !student.user.isActive,
      },
    });

    revalidatePath("/dashboard/admin/students");
    revalidatePath(`/dashboard/admin/students/${studentId}`);

    return {
      success: true,
      data: {
        isActive: updatedUser.isActive,
        message: updatedUser.isActive
          ? "Student account activated"
          : "Student account deactivated",
      },
    };
  } catch (error: any) {
    console.error("Error toggling student status:", error);
    return {
      success: false,
      error: error.message || "Failed to toggle student status",
    };
  }
}

// ============================================
// GET STUDENT (READ)
// ============================================

export async function getStudent(input: { studentId: string }) {
  // Check if input is undefined or not an object
  if (!input || typeof input !== "object") {
    return { success: false, error: "Invalid input format" };
  }

  const { studentId } = input;

  if (!studentId) {
    return { success: false, error: "Student ID is required" };
  }

  try {
    const { schoolId } = await getAuthenticatedUser();

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        classTerms: {
          where: { status: "ACTIVE" },
          include: {
            classTerm: {
              include: {
                class: true,
                term: {
                  include: {
                    session: true,
                  },
                },
              },
            },
          },
        },
        parents: {
          include: {
            parent: {
              include: {
                user: true,
              },
            },
          },
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            subject: true,
            term: {
              include: {
                session: true,
              },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          take: 5,
        },
        enrollmentHistory: {
          orderBy: { createdAt: "desc" },
          include: {
            classTerm: {
              include: {
                class: true,
                term: {
                  include: {
                    session: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    if (student.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized" };
    }

    const currentEnrollment = student.classTerms[0];
    const parents = student.parents.map((p) => ({
      id: p.parent.id,
      name: `${p.parent.user.firstName} ${p.parent.user.lastName}`,
      relationship: p.relationship,
      phone: p.parent.user.phone || "",
    }));

    const assessments = student.assessments.map((a) => ({
      id: a.id,
      subject: a.subject?.name || "Unknown",
      ca1: a.ca1,
      ca2: a.ca2,
      ca3: a.ca3,
      exam: a.exam,
      totalScore: calculateTotalScore(a),
      term: a.term?.name || "Unknown",
      session: a.term?.session?.name || "Unknown",
      isAbsent: a.isAbsent,
      isExempt: a.isExempt,
      isPublished: a.isPublished,
      createdAt: a.createdAt.toISOString(),
    }));

    const payments = student.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      paymentDate: p.paymentDate.toISOString().split("T")[0],
      receiptNo: p.receiptNo,
    }));

    const enrollmentHistory = student.enrollmentHistory.map((h) => ({
      id: h.id,
      className: h.classTerm?.class?.name || "Unknown",
      termName: h.classTerm?.term?.name || "Unknown",
      sessionName: h.classTerm?.term?.session?.name || "Unknown",
      action: h.action,
      createdAt: h.createdAt,
    }));

    return {
      success: true,
      data: {
        id: student.id,
        userId: student.user.id,
        admissionNo: student.admissionNo,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        fullName: `${student.user.firstName} ${student.user.lastName}`,
        dateOfBirth:
          student.user.dateOfBirth?.toISOString().split("T")[0] || "",
        gender: student.user.gender || "OTHER",
        state: student.user.state || "",
        lga: student.user.lga || "",
        address: student.user.address || "",
        phone: student.user.phone || "",
        year: student.year,
        isActive: student.user.isActive,
        currentClass: currentEnrollment
          ? {
              id: currentEnrollment.classTerm.class.id,
              name: currentEnrollment.classTerm.class.name,
              termId: currentEnrollment.classTerm.term.id,
              termName: currentEnrollment.classTerm.term.name,
              sessionName: currentEnrollment.classTerm.term.session.name,
            }
          : null,
        parents,
        assessments,
        payments,
        enrollmentHistory,
        createdAt: student.createdAt,
      },
    };
  } catch (error: any) {
    console.error("Error fetching student:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch student",
    };
  }
}

// Helper function to calculate total score
function calculateTotalScore(assessment: any): string {
  if (assessment.isAbsent) return "Absent";
  if (assessment.isExempt) return "Exempt";

  const scores = [
    assessment.ca1,
    assessment.ca2,
    assessment.ca3,
    assessment.exam,
  ];
  const validScores = scores.filter(
    (score) => score !== null && score !== undefined,
  );

  if (validScores.length === 0) return "-";

  const total = validScores.reduce((sum, score) => sum + score, 0);
  return total.toFixed(1);
}

// ============================================
// GET STUDENTS LIST (with pagination and filters)
// ============================================
export async function getStudents({
  classId,
  assignmentStatus,
  search,
  page = 1,
  pageSize = 20,
}: {
  classId?: string;
  assignmentStatus?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const { schoolId } = await getAuthenticatedUser();

    // Build where clause
    const where: any = {
      schoolId,
    };

    // Filter by class
    if (classId) {
      where.classTerms = {
        some: {
          classTerm: {
            classId,
          },
          status: "ACTIVE",
        },
      };
    }

    // Filter by assignment status
    if (assignmentStatus === "assigned") {
      where.classTerms = {
        some: {
          status: "ACTIVE",
        },
      };
    } else if (assignmentStatus === "notassigned") {
      where.classTerms = {
        none: {
          status: "ACTIVE",
        },
      };
    }

    // Search by name or admission number
    if (search) {
      where.OR = [
        { admissionNo: { contains: search, mode: "insensitive" } },
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Get total count
    const total = await prisma.student.count({ where });

    // Get students with pagination
    const students = await prisma.student.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: true,
        classTerms: {
          where: { status: "ACTIVE" },
          include: {
            classTerm: {
              include: {
                class: true,
                term: true,
              },
            },
          },
        },
        parents: {
          include: {
            parent: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get all classes for filter
    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, level: true },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      data: {
        students: students.map((s) => {
          const activeClassTerm = s.classTerms[0];
          return {
            id: s.id,
            admissionNo: s.admissionNo,
            firstName: s.user.firstName,
            lastName: s.user.lastName,
            fullName: `${s.user.firstName} ${s.user.lastName}`,
            class: activeClassTerm?.classTerm?.class?.name || "Not Assigned",
            classTermId: activeClassTerm?.classTermId,
            termName: activeClassTerm?.classTerm?.term?.name,
            gender: s.user.gender || "Not Specified",
            state: s.user.state || "Not Specified",
            lga: s.user.lga || "Not Specified",
            address: s.user.address || "Not Specified",
            year: s.year,
            parentName: s.parents[0]
              ? `${s.parents[0].parent.user.firstName} ${s.parents[0].parent.user.lastName}`
              : undefined,
            registrationDate: s.createdAt.toISOString(),
            isActive: s.user.isActive,
          };
        }),
        classes,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  } catch (error: any) {
    console.error("Error fetching students:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch students",
    };
  }
}

// ============================================
// HELPER FUNCTIONS (keep existing ones)
// ============================================
export async function getClasses() {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        level: true,
      },
      orderBy: { name: "asc" },
    });

    return { success: true, data: classes };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCurrentSessionAndTerm() {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const currentSession = await prisma.session.findFirst({
      where: { schoolId, isCurrent: true },
      include: {
        terms: {
          where: { isCurrent: true },
        },
      },
    });

    if (!currentSession || currentSession.terms.length === 0) {
      return { success: false, error: "No current session/term found" };
    }

    return {
      success: true,
      data: {
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        termId: currentSession.terms[0].id,
        termName: currentSession.terms[0].name,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getClassesBySchool() {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true },
    });

    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, level: true },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      data: {
        school,
        classes,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function searchParents(query: string) {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const parents = await prisma.parent.findMany({
      where: {
        schoolId,
        OR: [
          { user: { firstName: { contains: query, mode: "insensitive" } } },
          { user: { lastName: { contains: query, mode: "insensitive" } } },
          { user: { phone: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: { user: true },
      take: 10,
    });

    return {
      success: true,
      data: parents.map((p) => ({
        id: p.id,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.credentials?.[0]?.value,
        phone: p.user.phone,
        occupation: p.occupation,
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createParent(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  occupation?: string;
  gender?: Gender;
}) {
  try {
    const { schoolId } = await getAuthenticatedUser();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          role: "PARENT",
          phone: data.phone || "",
          gender: data.gender,
          isActive: true,
        },
      });

      const parent = await tx.parent.create({
        data: {
          userId: user.id,
          schoolId,
          occupation: data.occupation || "",
        },
      });

      if (data.email) {
        const defaultPassword = `${data.firstName.toLowerCase()}123`;
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        await tx.credential.create({
          data: {
            userId: user.id,
            type: "EMAIL",
            value: data.email,
            passwordHash: hashedPassword,
            isPrimary: true,
          },
        });
      }

      return { user, parent };
    });

    return {
      success: true,
      data: {
        id: result.parent.id,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        phone: result.user.phone,
        occupation: result.parent.occupation,
        gender: result.user.gender,
      },
    };
  } catch (error: any) {
    console.error("Error creating parent:", error);
    return { success: false, error: error.message };
  }
}

export async function checkClassTerms() {
  try {
    const { schoolId } = await getAuthenticatedUser();

    // Get all classes
    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true },
    });

    // Get current term
    const currentTerm = await prisma.term.findFirst({
      where: { session: { schoolId, isCurrent: true }, isCurrent: true },
      select: { id: true, name: true },
    });

    if (!currentTerm) {
      return { success: false, error: "No current term found" };
    }

    // Check existing ClassTerms
    const classTerms = await prisma.classTerm.findMany({
      where: {
        class: { schoolId },
        termId: currentTerm.id,
      },
      include: {
        class: true,
        term: true,
      },
    });

    return {
      success: true,
      data: {
        currentTerm,
        classes,
        classTerms: classTerms.map((ct) => ({
          id: ct.id,
          className: ct.class.name,
          termName: ct.term.name,
        })),
        missingClasses: classes
          .filter((c) => !classTerms.some((ct) => ct.classId === c.id))
          .map((c) => c.name),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
