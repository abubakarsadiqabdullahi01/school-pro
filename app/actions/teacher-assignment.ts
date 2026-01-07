"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

// Helper function to get admin's school ID
async function getAdminSchoolId(session: any): Promise<string | null> {
  if (session.user.role === "SUPER_ADMIN") {
    return null; // Super admin has access to all schools
  }

  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    select: { schoolId: true },
  });

  return admin?.schoolId || null;
}

// Assign a teacher to a class term (term-specific)
export async function assignTeacherToClass(data: {
  teacherId: string;
  classTermId: string;
}) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" };
    }

    // Verify the class term exists and belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: data.classTermId },
      include: {
        class: {
          select: { schoolId: true },
        },
        term: {
          select: { id: true, name: true, isCurrent: true },
        },
      },
    });

    if (!classTerm) {
      return { success: false, error: "Class term not found" };
    }

    if (
      session.user.role === "ADMIN" &&
      classTerm.class.schoolId !== schoolId
    ) {
      return { success: false, error: "Unauthorized to assign to this class" };
    }

    // Check if the assignment already exists
    const existingAssignment = await prisma.teacherClassTerm.findUnique({
      where: {
        teacherId_classTermId: {
          teacherId: data.teacherId,
          classTermId: data.classTermId,
        },
      },
    });

    if (existingAssignment) {
      return {
        success: true,
        message: "Teacher already assigned to this class",
      };
    }

    // Create a new assignment
    await prisma.teacherClassTerm.create({
      data: {
        teacherId: data.teacherId,
        classTermId: data.classTermId,
      },
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return { success: true, message: "Teacher successfully assigned to class" };
  } catch (error) {
    console.error("Error assigning teacher to class:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to assign teacher to class",
    };
  }
}

// Unassign a teacher from a class term
export async function unassignTeacherFromClass(teacherClassTermId: string) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    // Get the assignment details to verify permissions
    const assignment = await prisma.teacherClassTerm.findUnique({
      where: { id: teacherClassTermId },
      include: {
        teacher: {
          select: { schoolId: true, id: true },
        },
        classTerm: {
          include: {
            class: {
              select: { schoolId: true, name: true },
            },
            term: {
              select: { id: true, name: true, isCurrent: true },
            },
          },
        },
      },
    });

    if (!assignment) {
      return { success: false, error: "Assignment not found" };
    }

    // Get the admin's school ID if applicable
    if (session.user.role === "ADMIN") {
      const schoolId = await getAdminSchoolId(session);

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" };
      }

      // Verify the teacher and class belong to the admin's school
      if (
        assignment.teacher.schoolId !== schoolId ||
        assignment.classTerm.class.schoolId !== schoolId
      ) {
        return {
          success: false,
          error: "Unauthorized to unassign this teacher",
        };
      }
    }

    // Warning: Check if this is a past term assignment
    if (!assignment.classTerm.term.isCurrent) {
      return {
        success: false,
        error:
          "Cannot unassign teachers from past terms. This helps maintain historical records.",
      };
    }

    // Delete the assignment
    await prisma.teacherClassTerm.delete({
      where: { id: teacherClassTermId },
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${assignment.teacher.id}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return {
      success: true,
      message: "Teacher successfully unassigned from class",
    };
  } catch (error) {
    console.error("Error unassigning teacher from class:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to unassign teacher from class",
    };
  }
}

// Assign multiple classes to a teacher for a specific term
export async function assignClassesToTeacher(data: {
  teacherId: string;
  classTermIds: string[];
  termId: string;
}) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" };
    }

    // Verify all class terms belong to the specified term
    const classTerms = await prisma.classTerm.findMany({
      where: {
        id: { in: data.classTermIds },
        termId: data.termId,
      },
      include: {
        class: {
          select: { schoolId: true },
        },
      },
    });

    if (classTerms.length !== data.classTermIds.length) {
      return {
        success: false,
        error: "Some class terms are invalid or don't belong to this term",
      };
    }

    // Verify school ownership for admin
    if (session.user.role === "ADMIN") {
      const invalidClasses = classTerms.filter(
        (ct) => ct.class.schoolId !== schoolId,
      );
      if (invalidClasses.length > 0) {
        return {
          success: false,
          error: "Some classes don't belong to your school",
        };
      }
    }

    // Get existing assignments for this teacher and term
    const existingAssignments = await prisma.teacherClassTerm.findMany({
      where: {
        teacherId: data.teacherId,
        classTerm: {
          termId: data.termId,
        },
      },
    });

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Remove assignments that are not in the new list (only for this term)
      const assignmentsToRemove = existingAssignments.filter(
        (assignment) => !data.classTermIds.includes(assignment.classTermId),
      );

      if (assignmentsToRemove.length > 0) {
        await tx.teacherClassTerm.deleteMany({
          where: {
            id: { in: assignmentsToRemove.map((a) => a.id) },
          },
        });
      }

      // Add new assignments
      for (const classTermId of data.classTermIds) {
        const existingAssignment = existingAssignments.find(
          (a) => a.classTermId === classTermId,
        );

        if (!existingAssignment) {
          // Create new assignment
          await tx.teacherClassTerm.create({
            data: {
              teacherId: data.teacherId,
              classTermId,
            },
          });
        }
      }
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return {
      success: true,
      message: "Classes successfully assigned to teacher",
    };
  } catch (error) {
    console.error("Error assigning classes to teacher:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to assign classes to teacher",
    };
  }
}

// Assign a teacher to a subject for a specific term
export async function assignTeacherToSubject(data: {
  teacherId: string;
  subjectId: string;
  termId: string;
}) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" };
    }

    // Verify the subject exists and belongs to the admin's school
    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { schoolId: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found" };
    }

    if (session.user.role === "ADMIN" && subject.schoolId !== schoolId) {
      return {
        success: false,
        error: "Unauthorized to assign to this subject",
      };
    }

    // Verify the term exists
    const term = await prisma.term.findUnique({
      where: { id: data.termId },
      select: { id: true, name: true, isCurrent: true },
    });

    if (!term) {
      return { success: false, error: "Term not found" };
    }

    // Check if the assignment already exists
    const existingAssignment = await prisma.teacherSubject.findUnique({
      where: {
        teacherId_subjectId_termId: {
          teacherId: data.teacherId,
          subjectId: data.subjectId,
          termId: data.termId,
        },
      },
    });

    if (existingAssignment) {
      return {
        success: true,
        message: "Teacher already assigned to this subject for this term",
      };
    }

    // Create a new assignment
    await prisma.teacherSubject.create({
      data: {
        teacherId: data.teacherId,
        subjectId: data.subjectId,
        termId: data.termId,
      },
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return {
      success: true,
      message: "Subject successfully assigned to teacher",
    };
  } catch (error) {
    console.error("Error assigning teacher to subject:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to assign teacher to subject",
    };
  }
}

// Unassign a teacher from a subject
export async function unassignTeacherFromSubject(teacherSubjectId: string) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    // Get the assignment details to verify permissions
    const assignment = await prisma.teacherSubject.findUnique({
      where: { id: teacherSubjectId },
      include: {
        teacher: {
          select: { schoolId: true, id: true },
        },
        subject: {
          select: { schoolId: true, name: true },
        },
        term: {
          select: { id: true, name: true, isCurrent: true },
        },
      },
    });

    if (!assignment) {
      return { success: false, error: "Assignment not found" };
    }

    // Get the admin's school ID if applicable
    if (session.user.role === "ADMIN") {
      const schoolId = await getAdminSchoolId(session);

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" };
      }

      // Verify the teacher and subject belong to the admin's school
      if (
        assignment.teacher.schoolId !== schoolId ||
        assignment.subject.schoolId !== schoolId
      ) {
        return {
          success: false,
          error: "Unauthorized to unassign this teacher",
        };
      }
    }

    // Warning: Check if this is a past term assignment
    if (!assignment.term.isCurrent) {
      return {
        success: false,
        error:
          "Cannot unassign teachers from past term subjects. This helps maintain historical records.",
      };
    }

    // Delete the assignment
    await prisma.teacherSubject.delete({
      where: { id: teacherSubjectId },
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${assignment.teacher.id}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return {
      success: true,
      message: "Subject successfully unassigned from teacher",
    };
  } catch (error) {
    console.error("Error unassigning teacher from subject:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to unassign teacher from subject",
    };
  }
}

// Assign multiple subjects to a teacher for a specific term
export async function assignSubjectsToTeacher(data: {
  teacherId: string;
  subjectIds: string[];
  termId: string;
}) {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to assign this teacher" };
    }

    // Verify the term exists
    const term = await prisma.term.findUnique({
      where: { id: data.termId },
      select: { id: true, name: true, isCurrent: true },
    });

    if (!term) {
      return { success: false, error: "Term not found" };
    }

    // Verify all subjects belong to the school
    if (session.user.role === "ADMIN") {
      const subjects = await prisma.subject.findMany({
        where: {
          id: { in: data.subjectIds },
          schoolId,
        },
      });

      if (subjects.length !== data.subjectIds.length) {
        return {
          success: false,
          error: "Some subjects don't belong to your school",
        };
      }
    }

    // Get existing assignments for this teacher for the specific term
    const existingAssignments = await prisma.teacherSubject.findMany({
      where: {
        teacherId: data.teacherId,
        termId: data.termId,
      },
    });

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Remove assignments that are not in the new list (only for this term)
      const assignmentsToRemove = existingAssignments.filter(
        (assignment) => !data.subjectIds.includes(assignment.subjectId),
      );

      if (assignmentsToRemove.length > 0) {
        await tx.teacherSubject.deleteMany({
          where: {
            id: { in: assignmentsToRemove.map((a) => a.id) },
          },
        });
      }

      // Add new assignments
      for (const subjectId of data.subjectIds) {
        const existingAssignment = existingAssignments.find(
          (a) => a.subjectId === subjectId,
        );

        if (!existingAssignment) {
          // Create new assignment
          await tx.teacherSubject.create({
            data: {
              teacherId: data.teacherId,
              subjectId,
              termId: data.termId,
            },
          });
        }
      }
    });

    // Revalidate the teacher details page
    revalidatePath(`/dashboard/admin/teachers/${data.teacherId}`);
    revalidatePath(`/dashboard/admin/teachers`);

    return {
      success: true,
      message: "Subjects successfully assigned to teacher",
    };
  } catch (error) {
    console.error("Error assigning subjects to teacher:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to assign subjects to teacher",
    };
  }
}

// Get available class terms for assignment (grouped by term)
export async function getAvailableClassTerms() {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Get all class terms for the school
    const classTerms = await prisma.classTerm.findMany({
      where: schoolId
        ? {
            class: {
              schoolId,
            },
          }
        : undefined,
      include: {
        class: true,
        term: {
          include: {
            session: true,
          },
        },
        _count: {
          select: {
            students: {
              where: {
                status: "ACTIVE",
              },
            },
          },
        },
      },
      orderBy: [
        { term: { isCurrent: "desc" } },
        { term: { startDate: "desc" } },
        { class: { name: "asc" } },
      ],
    });

    // Format the class terms for the response
    const formattedClassTerms = classTerms.map((ct) => ({
      id: ct.id,
      className: ct.class.name,
      classLevel: ct.class.level,
      termName: ct.term.name,
      termId: ct.term.id,
      sessionName: ct.term.session.name,
      isCurrent: ct.term.isCurrent,
      studentsCount: ct._count.students,
    }));

    return {
      success: true,
      data: formattedClassTerms,
    };
  } catch (error) {
    console.error("Error fetching available class terms:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch available class terms",
    };
  }
}

// Get available subjects for assignment
export async function getAvailableSubjects() {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Get all subjects for the school
    const subjects = await prisma.subject.findMany({
      where: schoolId ? { schoolId } : undefined,
      orderBy: { name: "asc" },
    });

    // Format the subjects for the response
    const formattedSubjects = subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      code: subject.code,
    }));

    return {
      success: true,
      data: formattedSubjects,
    };
  } catch (error) {
    console.error("Error fetching available subjects:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch available subjects",
    };
  }
}

// Get available terms for a school
export async function getAvailableTerms() {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const schoolId = await getAdminSchoolId(session);

    if (session.user.role === "ADMIN" && !schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }

    // Get all terms for the school
    const terms = await prisma.term.findMany({
      where: schoolId
        ? {
            session: {
              schoolId,
            },
          }
        : undefined,
      include: {
        session: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    });

    const formattedTerms = terms.map((term) => ({
      id: term.id,
      name: term.name,
      sessionName: term.session.name,
      isCurrent: term.isCurrent,
      startDate: term.startDate,
      endDate: term.endDate,
    }));

    return {
      success: true,
      data: formattedTerms,
    };
  } catch (error) {
    console.error("Error fetching available terms:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch available terms",
    };
  }
}
