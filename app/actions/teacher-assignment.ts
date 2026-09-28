"use server";

import { assertSchoolAccess, requirePermission, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { canAssignInTerm } from "@/lib/term-rules";

function assertTeacherAssignmentSchool(actor: Actor, schoolId: string, message: string) {
  try {
    assertSchoolAccess(actor, schoolId);
  } catch {
    throw new Error(message);
  }
}

// Assign a teacher to a class term (term-specific)
export async function assignTeacherToClass(data: {
  teacherId: string;
  classTermId: string;
}) {
  try {
    const actor = await requirePermission("teachers.manage");

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    assertTeacherAssignmentSchool(actor, teacher.schoolId, "Unauthorized to assign this teacher");

    // Verify the class term exists and belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: data.classTermId },
      include: {
        class: {
          select: { schoolId: true },
        },
        term: {
          select: { id: true, name: true, isCurrent: true, endDate: true },
        },
      },
    });

    if (!classTerm) {
      return { success: false, error: "Class term not found" };
    }

    assertTeacherAssignmentSchool(actor, classTerm.class.schoolId, "Unauthorized to assign to this class");

    const termVerdict = canAssignInTerm(classTerm.term, actor.role);
    if (!termVerdict.allowed) {
      return { success: false, error: `${classTerm.term.name}: ${termVerdict.reason}` };
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
    const actor = await requirePermission("teachers.manage");

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
              select: { id: true, name: true, isCurrent: true, endDate: true },
            },
          },
        },
      },
    });

    if (!assignment) {
      return { success: false, error: "Assignment not found" };
    }

    assertTeacherAssignmentSchool(actor, assignment.teacher.schoolId, "Unauthorized to unassign this teacher");
    assertTeacherAssignmentSchool(actor, assignment.classTerm.class.schoolId, "Unauthorized to unassign this teacher");

    // Same rule as the assign paths, so both directions agree. Was `!isCurrent`, which also
    // blocked a term that has not started yet.
    const termVerdict = canAssignInTerm(assignment.classTerm.term, actor.role);
    if (!termVerdict.allowed) {
      return { success: false, error: `${assignment.classTerm.term.name}: ${termVerdict.reason}` };
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
    const actor = await requirePermission("teachers.manage");

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    assertTeacherAssignmentSchool(actor, teacher.schoolId, "Unauthorized to assign this teacher");

    // A closed term takes no new timetable. Checked before anything is written, because the
    // save below is a set-the-list operation: it deletes assignments missing from the new
    // list, which is how past-term rows could be removed despite `unassignTeacherFromSubject`
    // refusing to remove them one at a time.
    const targetTerm = await prisma.term.findUnique({
      where: { id: data.termId },
      select: { name: true, endDate: true, isCurrent: true, session: { select: { schoolId: true } } },
    });

    if (!targetTerm) {
      return { success: false, error: "Term not found" };
    }

    assertTeacherAssignmentSchool(actor, targetTerm.session.schoolId, "Unauthorized to assign in this term");

    const classesTermVerdict = canAssignInTerm(targetTerm, actor.role);
    if (!classesTermVerdict.allowed) {
      return { success: false, error: `${targetTerm.name}: ${classesTermVerdict.reason}` };
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

    try {
      for (const classTerm of classTerms) {
        assertSchoolAccess(actor, classTerm.class.schoolId);
      }
    } catch {
      return {
        success: false,
        error: "Some classes don't belong to your school",
      };
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
    const actor = await requirePermission("teachers.manage");

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    assertTeacherAssignmentSchool(actor, teacher.schoolId, "Unauthorized to assign this teacher");

    // Verify the subject exists and belongs to the admin's school
    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { schoolId: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found" };
    }

    assertTeacherAssignmentSchool(actor, subject.schoolId, "Unauthorized to assign to this subject");

    // Verify the term exists and belongs to the admin's school. Checking only that it
    // exists validated two ids out of three: the teacher and the subject were scoped, and
    // the term was taken on trust, so an id from another school produced an assignment row
    // pointing across the tenancy boundary.
    const term = await prisma.term.findUnique({
      where: { id: data.termId },
      select: {
        id: true,
        name: true,
        isCurrent: true,
        endDate: true,
        session: { select: { schoolId: true } },
      },
    });

    if (!term) {
      return { success: false, error: "Term not found" };
    }

    assertTeacherAssignmentSchool(actor, term.session.schoolId, "Unauthorized to assign in this term");

    const subjectTermVerdict = canAssignInTerm(term, actor.role);
    if (!subjectTermVerdict.allowed) {
      return { success: false, error: `${term.name}: ${subjectTermVerdict.reason}` };
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
    const actor = await requirePermission("teachers.manage");

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
          select: { id: true, name: true, isCurrent: true, endDate: true },
        },
      },
    });

    if (!assignment) {
      return { success: false, error: "Assignment not found" };
    }

    assertTeacherAssignmentSchool(actor, assignment.teacher.schoolId, "Unauthorized to unassign this teacher");
    assertTeacherAssignmentSchool(actor, assignment.subject.schoolId, "Unauthorized to unassign this teacher");

    // The same rule the assign paths use, so the two directions agree. This used to test
    // `!isCurrent`, which also blocked a term that has not started yet — undoing a mistake
    // on next term's timetable is not rewriting history.
    const termVerdict = canAssignInTerm(assignment.term, actor.role);
    if (!termVerdict.allowed) {
      return { success: false, error: `${assignment.term.name}: ${termVerdict.reason}` };
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
    const actor = await requirePermission("teachers.manage");

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.teacherId },
      select: { schoolId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    assertTeacherAssignmentSchool(actor, teacher.schoolId, "Unauthorized to assign this teacher");

    // Verify the term exists and belongs to the admin's school. Checking only that it
    // exists validated two ids out of three: the teacher and the subject were scoped, and
    // the term was taken on trust, so an id from another school produced an assignment row
    // pointing across the tenancy boundary.
    const term = await prisma.term.findUnique({
      where: { id: data.termId },
      select: {
        id: true,
        name: true,
        isCurrent: true,
        endDate: true,
        session: { select: { schoolId: true } },
      },
    });

    if (!term) {
      return { success: false, error: "Term not found" };
    }

    assertTeacherAssignmentSchool(actor, term.session.schoolId, "Unauthorized to assign in this term");

    // See the note in `assignClassesToTeacher`: this save also removes what is missing from
    // the list, so a closed term has to be refused before the transaction opens.
    const bulkTermVerdict = canAssignInTerm(term, actor.role);
    if (!bulkTermVerdict.allowed) {
      return { success: false, error: `${term.name}: ${bulkTermVerdict.reason}` };
    }

    const subjects = await prisma.subject.findMany({
      where: { id: { in: data.subjectIds } },
      select: { id: true, schoolId: true },
    });

    if (subjects.length !== data.subjectIds.length) {
      return {
        success: false,
        error: "Some subjects don't belong to your school",
      };
    }

    try {
      for (const subject of subjects) {
        assertSchoolAccess(actor, subject.schoolId);
      }
    } catch {
      return {
        success: false,
        error: "Some subjects don't belong to your school",
      };
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
    const actor = await requirePermission("teachers.manage");

    // Get all class terms for the school
    const classTerms = await prisma.classTerm.findMany({
      where: actor.schoolId ? { class: { schoolId: actor.schoolId } } : undefined,
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
    const actor = await requirePermission("teachers.manage");

    // Get all subjects for the school
    const subjects = await prisma.subject.findMany({
      where: actor.schoolId ? { schoolId: actor.schoolId } : undefined,
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
    const actor = await requirePermission("teachers.manage");

    // Get all terms for the school
    const terms = await prisma.term.findMany({
      where: actor.schoolId ? { session: { schoolId: actor.schoolId } } : undefined,
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

    // `canAssign` travels with each term so the picker can grey out the ones the server
    // would refuse, rather than warning that a past term "creates a historical record" and
    // then letting the save through.
    const formattedTerms = terms.map((term) => {
      const verdict = canAssignInTerm(term, actor.role);
      return {
        id: term.id,
        name: term.name,
        sessionName: term.session.name,
        isCurrent: term.isCurrent,
        startDate: term.startDate,
        endDate: term.endDate,
        canAssign: verdict.allowed,
        assignBlockedReason: verdict.allowed ? null : verdict.reason,
      };
    });

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
