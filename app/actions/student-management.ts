"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { raiseEnrolmentCharges } from "@/lib/fee-charges.server";
import { toNumber } from "@/lib/money";
import bcrypt from "bcryptjs";
import { Gender } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { defaultPasswordForDate, defaultPasswordForStudent } from "@/lib/auth/default-password";
import { revokeAllSessionsForUser } from "@/lib/sessions.server";
import { recordAudit } from "@/lib/audit";

// ============================================
// AUTHENTICATION HELPER
// ============================================
async function getAuthenticatedUser() {
  const actor = await requirePermission("students.manage");

  if (!actor.schoolId) {
    throw new Error("Unauthorized: select a school before managing students");
  }

  return { userId: actor.userId, schoolId: actor.schoolId };
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
    // The registration year rather than a random string: a bursar enrolling a class
    // reads it out once, and a learner who forgets it can read it off their own
    // admission number. See lib/auth/default-password.ts for why that is a first
    // password and not a lasting one.
    const temporaryPassword = data.createLoginCredentials
      ? defaultPasswordForStudent({ year: data.year })
      : null;
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
    const classId = data.classId;
    const termId = data.termId;

    // Tenancy. The class, term and parent arrive as ids from the caller, and lib/authz.ts
    // states the rule this has to follow: school scope comes from the session, never from a
    // parameter. Without these checks an admin can enrol their student into another
    // school's class or term — which also creates a ClassTerm inside that school's data —
    // or attach another school's parent, who would then see this child on their dashboard.
    //
    // Checked before the admission sequence is touched, so a rejected request does not burn
    // an admission number and leave a gap in the register.
    const [ownedClass, ownedTerm, ownedParent] = await Promise.all([
      prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }),
      prisma.term.findFirst({ where: { id: termId, session: { schoolId } }, select: { id: true } }),
      data.parentId
        ? prisma.parent.findFirst({ where: { id: data.parentId, schoolId }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (!ownedClass) {
      return { success: false, error: "That class does not belong to this school" };
    }
    if (!ownedTerm) {
      return { success: false, error: "That term does not belong to this school" };
    }
    if (data.parentId && !ownedParent) {
      return { success: false, error: "That parent does not belong to this school" };
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
        const hashedPassword = await bcrypt.hash(temporaryPassword!, 12);

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
        classId,
        "termId:",
        termId,
      );

      // First, get or create the ClassTerm
      let classTerm = await tx.classTerm.findFirst({
        where: {
          classId,
          termId,
        },
      });

      // If ClassTerm doesn't exist, create it
      if (!classTerm) {
        console.log("ClassTerm not found, creating new one...");
        classTerm = await tx.classTerm.create({
          data: {
            classId,
            termId,
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
            termId,
            status: "ACTIVE",
          },
        });

        // Joining a class is what makes a student billable. Raising the charges
        // here, in the same transaction, is what stops a student admitted after
        // the fee schedule was set up from carrying a zero balance forever.
        await raiseEnrolmentCharges(tx, {
          schoolId,
          studentId: student.id,
          classTermId: classTerm.id,
          termId,
        });

        // Log enrollment history
        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: student.id,
            classTermId: classTerm.id,
            termId,
            action: "ENROLLED",
            createdBy: userId,
          },
        });

        console.log("Student enrolled successfully!");
      } else {
        console.error("Failed to create/find ClassTerm");
      }

      return { user, student, admissionNo, classTerm, temporaryPassword };
    });

    revalidatePath("/dashboard/admin/students");

    return {
      success: true,
      data: {
        id: result.student.id,
        userId: result.user.id,
        admissionNo: result.admissionNo,
        classTermId: result.classTerm?.id,
        temporaryPassword: result.temporaryPassword,
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
        // Scoped to the acting admin's school. Without it a student could be moved into
        // another school's class term — the same hole creation had, reached through the
        // edit form instead.
        const newClassTerm = await tx.classTerm.findFirst({
          where: {
            classId: data.classId,
            termId: data.termId,
            class: { schoolId },
            term: { session: { schoolId } },
          },
        });

        // Previously this fell through silently: no class term meant no move, and the
        // caller was still told the update succeeded. The admin walked away believing the
        // class had changed.
        if (!newClassTerm) {
          throw new Error(
            "That class is not open for that term in this school, so the student cannot be moved into it",
          );
        }

        {
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

            // Same rule as admission: the new class's fees are raised on the
            // move. Charges already on the old class term stay as they are —
            // reversing them is an accounting decision, not an edit.
            await raiseEnrolmentCharges(tx, {
              schoolId,
              studentId: studentId,
              classTermId: newClassTerm.id,
              termId: data.termId,
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
        // Money owed counts as critical data. A student can be billed and never pay, so
        // checking payments alone let a debtor be hard deleted — and StudentCharge cascades
        // on the student, so their debt disappeared from the debtors report and the
        // accumulated fund with nothing left to show it had ever been owed.
        charges: true,
        // Everything below holds the student with onDelete: Restrict, so the database will
        // refuse a hard delete outright — as a raw foreign-key error the screen reports as
        // "Failed to delete student". A learner can hold a dedicated virtual account with no
        // charges at all, so counting fees does not cover this. Archiving is the right
        // answer for any of them: an online-payment footprint is financial history.
        gatewayTransactions: true,
        dedicatedAccounts: true,
        unappliedPayments: true,
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
    const hasCharges = student.charges.length > 0;
    const hasGatewayFootprint =
      student.gatewayTransactions.length > 0 ||
      student.dedicatedAccounts.length > 0 ||
      student.unappliedPayments.length > 0;

    if (hasAssessments || hasPayments || hasCharges || hasGatewayFootprint) {
      // Archive rather than delete. `isActive` alone carries the status: the previous
      // version wrote `ARCHIVED_` into `state`, which holds the student's home state, so
      // archiving corrupted an address field and archiving twice produced
      // ARCHIVED_ARCHIVED_Kano with no way back.
      await prisma.user.update({
        where: { id: student.userId },
        data: { isActive: false },
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
      include: {
        user: {
          include: {
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
              take: 1,
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
      // Plain number at the boundary into a client component. Display only.
      amount: toNumber(p.amount),
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
        // The passport photograph. Empty string rather than null so the client can hand it
        // straight to <AvatarImage>, which treats "" as "no image" and falls back cleanly.
        avatarUrl: student.user.avatarUrl || "",
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
        { admissionNo: { contains: search } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
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
            avatarUrl: s.user.avatarUrl || "",
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
          { user: { firstName: { contains: query } } },
          { user: { lastName: { contains: query } } },
          { user: { phone: { contains: query } } },
        ],
      },
      include: {
        user: {
          include: {
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
              take: 1,
            },
          },
        },
      },
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
    // Same rule as Parents > Add Parent, which is a different function creating the same
    // kind of record. A guardian added here and a guardian added there must not end up
    // with passwords of two different shapes.
    const temporaryPassword = data.email ? defaultPasswordForDate(new Date()) : null;
    const { schoolId } = await getAuthenticatedUser();

    // Credential values are unique across the whole platform, not per school, so a clash
    // has to be caught here. Left to the database it surfaced as a raw Prisma error —
    // "Invalid `tx.credential.create()`..." — in front of whoever was adding the parent.
    if (data.email) {
      const taken = await prisma.credential.findUnique({
        where: { value: data.email },
        select: { id: true },
      });
      if (taken) {
        return { success: false, error: "That email is already in use by another account" };
      }
    }

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
        const hashedPassword = await bcrypt.hash(temporaryPassword!, 12);

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

      return { user, parent, temporaryPassword };
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
          temporaryPassword: result.temporaryPassword,
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

// ============================================
// RESET STUDENT PASSWORD
// ============================================

/**
 * Returns a learner's password to their registration year.
 *
 * Every credential on the account is updated, not just the one they normally use: a
 * learner may sign in by admission number and a portal invitation may have added an email
 * one, and leaving the second on the old password means "reset" did not mean what it said.
 *
 * Existing sessions are revoked. A reset is usually requested because somebody else knows
 * the password, and a signed-in session would outlive the change.
 */
export async function resetStudentPassword(studentId: string) {
  try {
    const actor = await requirePermission("students.manage");
    if (!actor.schoolId) {
      return { success: false, error: "Select a school before resetting a password" };
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        schoolId: true,
        userId: true,
        admissionNo: true,
        year: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    if (student.schoolId !== actor.schoolId) {
      return { success: false, error: "That student belongs to another school" };
    }

    const newPassword = defaultPasswordForStudent(student);
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { count } = await prisma.credential.updateMany({
      where: { userId: student.userId },
      data: { passwordHash },
    });

    if (count === 0) {
      return {
        success: false,
        error: "This student has no login yet, so there is no password to reset.",
      };
    }

    await revokeAllSessionsForUser(student.userId);

    await recordAudit({
      actor,
      action: "student.password_reset",
      entityType: "Student",
      entityId: studentId,
      schoolId: student.schoolId,
      // The password itself is never written to the log — only that it was reset, by whom.
      summary:
        `Reset the password for ${student.user.firstName} ${student.user.lastName} ` +
        `(${student.admissionNo}) to their registration year`,
    });

    revalidatePath(`/dashboard/admin/students/${studentId}`);

    return { success: true, data: { newPassword }, message: "Password reset" };
  } catch (error) {
    console.error("Error resetting student password:", error);
    return { success: false, error: "Failed to reset password" };
  }
}
