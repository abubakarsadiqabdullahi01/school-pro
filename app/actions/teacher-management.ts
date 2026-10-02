"use server";

import {
  assertSchoolAccess,
  authActive,
  requireAnyPermission,
  requirePermission,
  requireTeacher,
  type Actor,
} from "@/lib/authz";
import { TEACHER_ASSIGNMENT_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Gender, CredentialType } from "@prisma/client";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import { revokeAllSessionsForUser } from "@/lib/sessions.server";
import { assertScoresWithinScheme } from "@/lib/assessment-scheme";
import { loadAssessmentScheme } from "@/lib/assessment-scheme.server";
import { provisionedStaffNo, provisionStaffForTeacher } from "@/lib/hr/staff-provisioning";

/**
 * Hiring, editing, deactivating and resetting a teacher: employment, so HR's key.
 *
 * Reading the directory and one teacher's profile is wider - see `requireTeacherViewer` -
 * because the Exams Officer has to find a teacher before assigning them a subject.
 */
async function requireTeacherManager(schoolId?: string | null) {
  const actor = await requirePermission("teachers.manage");
  return scopeTeacherActor(actor, schoolId);
}

/** The directory and profile reads, open to whoever may assign teachers. */
async function requireTeacherViewer() {
  const actor = await requireAnyPermission(TEACHER_ASSIGNMENT_PERMISSIONS);
  return scopeTeacherActor(actor);
}

function scopeTeacherActor(actor: Actor, schoolId?: string | null) {
  if (schoolId) {
    assertSchoolAccess(actor, schoolId);
    return { actor, schoolId };
  }

  if (!actor.schoolId) {
    return { actor, schoolId: undefined };
  }

  return { actor, schoolId: actor.schoolId };
}

// Search for teachers
export async function searchTeachers(query = "") {
  try {
    const { schoolId } = await requireTeacherViewer();

    // Search for teachers based on the query
    const teachers = await prisma.teacher.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        ...(query
          ? {
              OR: [
                {
                  user: { firstName: { contains: query } },
                },
                {
                  user: { lastName: { contains: query } },
                },
                {
                  user: {
                    credentials: {
                      some: { value: { contains: query } },
                    },
                  },
                },
                { staffId: { contains: query } },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            gender: true,
            state: true,
            lga: true,
            address: true,
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
            },
          },
        },
        school: true,
        teacherClassTerms: {
          select: { id: true },
        },
        teacherSubjects: {
          select: { id: true },
        },
      },
      take: 10, // Limit results
    });

    // Format the results
    const formattedTeachers = teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.userId,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      email:
        teacher.user.credentials.length > 0
          ? teacher.user.credentials[0].value
          : "",
      phone: teacher.user.phone || "",
      // The query selected avatarUrl but the mapping dropped it, so the table's
      // <AvatarImage> always received undefined and every row fell back to initials —
      // a photo could be uploaded and would never appear in the list.
      avatarUrl: teacher.user.avatarUrl || "",
      staffId: teacher.staffId,
      department: teacher.department || "",
      gender: teacher.user.gender,
      state: teacher.user.state,
      lga: teacher.user.lga,
      address: teacher.user.address,
      schoolName: teacher.school.name,
      classesCount: teacher.teacherClassTerms.length,
      subjectsCount: teacher.teacherSubjects.length,
    }));

    return {
      success: true,
      data: formattedTeachers,
    };
  } catch (error) {
    console.error("Error searching for teachers:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to search for teachers",
    };
  }
}

// Create a new teacher
export async function createTeacher(data: {
  schoolId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  staffId: string;
  department?: string;
  qualification?: string;
  gender?: Gender | null;
  state?: string;
  lga?: string;
  address?: string;
  dateOfBirth?: string;
  credentials?: Array<{
    type: CredentialType;
    value: string;
    passwordHash: string;
    isPrimary: boolean;
  }>;
}) {
  try {
    if (!data.schoolId) {
      return { success: false, error: "School is required to create a teacher" };
    }
    const { schoolId } = await requireTeacherManager(data.schoolId);
    if (!schoolId) {
      return { success: false, error: "School is required to create a teacher" };
    }

    // Legacy login provisioning is allowed only for a person already hired in HR.
    await requirePermission("payroll.manage");
    const hiredStaff = await prisma.staff.findFirst({
      where: { schoolId, staffNo: data.staffId, userId: null, staffType: "TEACHER", employmentStatus: "ACTIVE", firstName: data.firstName.trim(), lastName: data.lastName.trim() },
      select: { id: true },
    });
    if (!hiredStaff) return { success: false, error: "Create the staff record in HR first, then create its teacher login from that record." };

    // Check if staffId already exists
    const existingTeacher = await prisma.teacher.findFirst({
      where: {
        staffId: data.staffId,
        schoolId,
      },
    });

    if (existingTeacher) {
      return {
        success: false,
        error: `A teacher with staff ID "${data.staffId}" already exists.`,
      };
    }

    // Check if credentials already exist
    if (data.credentials && data.credentials.length > 0) {
      for (const cred of data.credentials) {
        const existingCred = await prisma.credential.findUnique({
          where: {
            value: cred.value,
          },
        });

        if (existingCred) {
          // The staff ID doubles as a sign-in name, and sign-in names are unique across every
          // school on the platform - while HR numbers staff per school, as STF-0001 by
          // default. Two schools on the default prefix collide on their first teacher.
          if (cred.type === "PSN") {
            return {
              success: false,
              error:
                `Staff ID "${cred.value}" is already someone's sign-in name on DigiSchool, possibly ` +
                "at another school. Use a staff ID unique to this school - HR can set a " +
                "school-specific staff number prefix, such as your school code, under HR settings.",
            };
          }
          return {
            success: false,
            error: `A user with this ${cred.type.toLowerCase()} already exists. Please use a different ${cred.type.toLowerCase()}.`,
          };
        }
      }
    }

    const requestedPassword = data.credentials?.[0]?.passwordHash ?? "";
    const temporaryPassword =
      requestedPassword.length >= 8 &&
      /[a-z]/.test(requestedPassword) &&
      /[A-Z]/.test(requestedPassword) &&
      /[0-9]/.test(requestedPassword)
        ? requestedPassword
        : generateTemporaryPassword();

    // Start a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create a new user for the teacher
      const teacherUser = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: "TEACHER",
          isActive: true,
          gender: data.gender,
          state: data.state,
          lga: data.lga,
          address: data.address,
          dateOfBirth: data.dateOfBirth
            ? new Date(data.dateOfBirth)
            : undefined,
        },
      });

      // Create teacher credentials if provided
      if (data.credentials && data.credentials.length > 0) {
        for (const cred of data.credentials) {
          // Hash the password using bcrypt
          const passwordHash = await bcrypt.hash(temporaryPassword, 12);

          await tx.credential.create({
            data: {
              userId: teacherUser.id,
              type: cred.type,
              value: cred.value,
              passwordHash,
              isPrimary: cred.isPrimary,
            },
          });
        }
      }

      // Create the teacher record
      const teacher = await tx.teacher.create({
        data: {
          userId: teacherUser.id,
          schoolId,
          staffId: data.staffId,
          department: data.department,
          qualification: data.qualification,
        },
      });

      // Get email from credentials if available
      let email = "";
      if (data.credentials) {
        const emailCred = data.credentials.find(
          (cred) => cred.type === "EMAIL",
        );
        if (emailCred) {
          email = emailCred.value;
        }
      }

      // Tell HR there is somebody new.
      //
      // Before this, adding a teacher created a login and a Teacher row and nothing else:
      // they had no staff record, could not be put on payroll, and nothing anywhere said
      // so. The record starts NOT_STARTED rather than looking complete, because all it has
      // is a name — `lib/hr/staff-onboarding.ts` decides when it is actually finished.
      //
      // This never throws: a school with HR not yet configured must still be able to add a
      // teacher, and `unlinkedTeachers` catches anyone this misses.
      const provisioned = await provisionStaffForTeacher(tx, {
        schoolId,
        userId: teacherUser.id,
        firstName: data.firstName,
        lastName: data.lastName,
        preferredStaffNo: data.staffId,
        phone: data.phone,
        email: email || null,
        gender: data.gender as "MALE" | "FEMALE" | "OTHER" | null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        address: data.address,
        department: data.department,
        qualification: data.qualification,
      });
      if (provisioned.created || provisioned.reason !== "LINKED_EXISTING" || provisioned.staffId !== hiredStaff.id) {
        throw new Error("The HR record could not be linked. No login was created; refresh and try again.");
      }

      return {
        id: teacher.id,
        userId: teacherUser.id,
        firstName: teacherUser.firstName,
        lastName: teacherUser.lastName,
        email: email,
        phone: teacherUser.phone,
        staffId: teacher.staffId,
        position: teacher.department,
        qualification: teacher.qualification,
        gender: teacherUser.gender,
        state: teacherUser.state,
        lga: teacherUser.lga,
        address: teacherUser.address,
        dateOfBirth: teacherUser.dateOfBirth,
        temporaryPassword,
        /**
         * The HR record they are on - a new one, or the one HR had already hired them under
         * when the staff ID typed here matched it. Null only when provisioning could not
         * run; the onboarding queue will catch that.
         */
        staffNo: provisionedStaffNo(provisioned),
        linkedToExistingHrRecord: !provisioned.created && provisioned.reason === "LINKED_EXISTING",
      };
    });

    // Revalidate the teachers list page
    revalidatePath("/dashboard/admin/teachers");

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error creating teacher:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create teacher",
    };
  }
}

// Get all teachers
export async function getTeachers() {
  try {
    const { schoolId } = await requireTeacherViewer();

    // Get all teachers for the school
    const teachers = await prisma.teacher.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            gender: true,
            dateOfBirth: true,
            createdAt: true,
            isActive: true,
            credentials: {
              where: { type: "EMAIL" },
              select: { value: true },
            },
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        teacherClassTerms: {
          where: {
            classTerm: {
              term: {
                isCurrent: true,
              },
            },
          },
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
        teacherSubjects: {
          where: {
            term: {
              isCurrent: true,
            },
          },
          include: {
            subject: true,
            term: {
              select: {
                id: true,
                name: true,
                isCurrent: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        assessments: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // A teacher who also exists in HR as staff is archived rather than removed, so the
    // delete dialog needs to know before it promises an outcome.
    const staffUserIds = new Set(
      (
        await prisma.staff.findMany({
          where: { userId: { in: teachers.map((t) => t.userId) } },
          select: { userId: true },
        })
      )
        .map((staff) => staff.userId)
        .filter((id): id is string => id !== null),
    );

    // Format the teachers for the response
    const formattedTeachers = teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.userId,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
      email:
        teacher.user.credentials.length > 0
          ? teacher.user.credentials[0].value
          : "",
      phone: teacher.user.phone || "",
      avatarUrl: teacher.user.avatarUrl || "",
      staffId: teacher.staffId,
      department: teacher.department || "",
      qualification: teacher.qualification || "",
      gender: teacher.user.gender,
      dateOfBirth: teacher.user.dateOfBirth,
      state: "", // These could be added from user data if needed
      lga: "",
      address: "",
      school: {
        id: teacher.school.id,
        name: teacher.school.name,
        code: teacher.school.code,
      },
      classesCount: teacher.teacherClassTerms.length,
      subjectsCount: teacher.teacherSubjects.length,
      assessmentsCount: teacher.assessments.length,
      hasStaffRecord: staffUserIds.has(teacher.userId),
      // Archiving a teacher sets this false. Without it on the payload an archived teacher
      // stayed in the list looking exactly like an active one.
      isActive: teacher.user.isActive,
      classes: teacher.teacherClassTerms.map((tct) => ({
        id: tct.id,
        className: tct.classTerm.class.name,
        classLevel: tct.classTerm.class.level,
        termName: tct.classTerm.term.name,
        sessionName: tct.classTerm.term.session.name,
        isCurrent: tct.classTerm.term.isCurrent,
      })),
      subjects: teacher.teacherSubjects.map((ts) => ({
        id: ts.id,
        subjectId: ts.subjectId,
        name: ts.subject.name,
        code: ts.subject.code,
        termId: ts.termId,
        termName: ts.term.name,
        sessionName: ts.term.session.name,
        isCurrent: ts.term.isCurrent,
      })),
      createdAt: teacher.createdAt,
    }));

    return {
      success: true,
      data: formattedTeachers,
    };
  } catch (error) {
    console.error("Error fetching teachers:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch teachers",
    };
  }
}

export async function getTeacher(id: string) {
  try {
    const { actor } = await requireTeacherViewer();

    // Get the teacher details
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            gender: true,
            dateOfBirth: true,
            state: true,
            lga: true,
            address: true,
            createdAt: true,
            credentials: {
              where: { type: "EMAIL" },
              select: { id: true, value: true },
            },
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        teacherClassTerms: {
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
        teacherSubjects: {
          include: {
            subject: true,
            term: {
              select: {
                id: true,
                name: true,
                isCurrent: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { term: { isCurrent: "desc" } },
            { term: { startDate: "desc" } },
            { subject: { name: "asc" } },
          ],
        },
        assessments: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    try {
      assertSchoolAccess(actor, teacher.schoolId);
    } catch {
      return { success: false, error: "Unauthorized to view this teacher" };
    }

    // Format the teacher for the response
    const formattedTeacher = {
      id: teacher.id,
      userId: teacher.userId,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
      email:
        teacher.user.credentials.length > 0
          ? teacher.user.credentials[0].value
          : "",
      emailCredentialId: teacher.user.credentials[0]?.id || "",
      phone: teacher.user.phone || "",
      avatarUrl: teacher.user.avatarUrl || "",
      staffId: teacher.staffId,
      department: teacher.department || "",
      position: teacher.department || "",
      qualification: teacher.qualification || "",
      gender: teacher.user.gender,
      dateOfBirth: teacher.user.dateOfBirth,
      state: teacher.user.state || "",
      lga: teacher.user.lga || "",
      address: teacher.user.address || "",
      school: {
        id: teacher.school.id,
        name: teacher.school.name,
        code: teacher.school.code,
      },
      schoolId: teacher.school.id,
      schoolName: teacher.school.name,
      schoolCode: teacher.school.code,
      classes: teacher.teacherClassTerms.map((tct) => ({
        id: tct.id,
        classTermId: tct.classTermId,
        className: tct.classTerm.class.name,
        classLevel: tct.classTerm.class.level,
        termName: tct.classTerm.term.name,
        sessionName: tct.classTerm.term.session.name,
        isCurrent: tct.classTerm.term.isCurrent,
      })),
      subjects: teacher.teacherSubjects.map((ts) => ({
        id: ts.id,
        subjectId: ts.subjectId,
        name: ts.subject.name,
        code: ts.subject.code,
        termId: ts.termId,
        termName: ts.term.name,
        sessionName: ts.term.session.name,
        isCurrent: ts.term.isCurrent,
      })),
      assessmentsCount: teacher.assessments.length,
      createdAt: teacher.createdAt,
    };

    return { success: true, data: formattedTeacher };
  } catch (error) {
    console.error("Error fetching teacher:", error);
    return { success: false, error: "Failed to fetch teacher" };
  }
}

// Update an existing teacher
export async function updateTeacher(data: {
  id: string;
  userId: string;
  emailCredentialId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  staffId: string;
  position?: string;
  qualification?: string;
  gender?: Gender | null;
  dateOfBirth?: string;
  state?: string;
  lga?: string;
  address?: string;
}) {
  try {
    const { actor } = await requireTeacherManager();

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: data.id },
      select: { schoolId: true, staffId: true, userId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    try {
      assertSchoolAccess(actor, teacher.schoolId);
    } catch {
      return { success: false, error: "Unauthorized to update this teacher" };
    }

    // The login and email credential being edited are this teacher's, read from the
    // database. The form sends ids for both, and trusting them let anyone who may edit
    // their own school's teachers rename any user and rewrite any account's login email.
    const emailCredential = await prisma.credential.findFirst({
      where: { userId: teacher.userId, type: "EMAIL" },
      select: { id: true },
    });
    data = { ...data, userId: teacher.userId, emailCredentialId: emailCredential?.id };

    // Check if the staff ID is being changed and if it already exists for another teacher
    if (data.staffId !== teacher.staffId) {
      const existingTeacher = await prisma.teacher.findFirst({
        where: {
          staffId: data.staffId,
          schoolId: teacher.schoolId,
          id: { not: data.id },
        },
      });

      if (existingTeacher) {
        return {
          success: false,
          error: `A teacher with staff ID "${data.staffId}" already exists.`,
        };
      }
    }

    // Start a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the user record
      await tx.user.update({
        where: { id: data.userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth
            ? new Date(data.dateOfBirth)
            : undefined,
          state: data.state,
          lga: data.lga,
          address: data.address,
        },
      });

      // Update the teacher record
      await tx.teacher.update({
        where: { id: data.id },
        data: {
          staffId: data.staffId,
          department: data.position,
          qualification: data.qualification,
        },
      });

      // Handle email credential update
      if (data.email) {
        if (data.emailCredentialId) {
          // Check if the email is already in use by another user
          const existingCred = await tx.credential.findFirst({
            where: {
              value: data.email,
              NOT: {
                id: data.emailCredentialId,
              },
            },
          });

          if (existingCred) {
            throw new Error("This email is already in use by another user.");
          }

          // Update existing email credential
          await tx.credential.update({
            where: { id: data.emailCredentialId },
            data: {
              value: data.email,
            },
          });
        } else {
          // Check if the email is already in use
          const existingCred = await tx.credential.findUnique({
            where: {
              value: data.email,
            },
          });

          if (existingCred) {
            throw new Error("This email is already in use by another user.");
          }

          // Create new email credential
          const existingLogin = await tx.credential.findFirst({
            where: { userId: data.userId },
            select: { passwordHash: true },
          });
          if (!existingLogin?.passwordHash) {
            throw new Error("Reset this teacher's password before adding a new login method");
          }
          await tx.credential.create({
            data: {
              userId: data.userId,
              type: "EMAIL",
              value: data.email,
              passwordHash: existingLogin.passwordHash,
              isPrimary: true,
            },
          });
        }
      }

      return { success: true };
    });

    // Revalidate the teachers list page
    revalidatePath("/dashboard/admin/teachers");
    revalidatePath(`/dashboard/admin/teachers/${data.id}`);

    return { success: true };
  } catch (error) {
    console.error("Error updating teacher:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update teacher",
    };
  }
}

// Delete a teacher
export async function deleteTeacher(teacherId: string) {
  try {
    const { actor } = await requireTeacherManager();

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: {
        teacherClassTerms: true,
        teacherSubjects: true,
        // Scores the teacher entered belong to the student, not to the teacher, and the
        // payroll record belongs to HR. Both are counted before deciding whether this
        // teacher can be removed at all.
        assessments: { select: { id: true }, take: 1 },
      },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    try {
      assertSchoolAccess(actor, teacher.schoolId);
    } catch {
      return { success: false, error: "Unauthorized to delete this teacher" };
    }

    // The same human can exist twice: once as a Teacher (a login and a timetable) and once
    // as Staff (a salary). Staff.userId is ON DELETE SET NULL, so deleting the login left
    // the staff member on the payroll with their name and salary intact and no way to tell
    // they had ever had an account.
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: teacher.userId },
      select: { id: true, employmentStatus: true },
    });

    const hasAssessments = teacher.assessments.length > 0;

    if (hasAssessments || staffRecord) {
      // Archive rather than delete, the same way a student with academic or payment records
      // is archived. `isActive` alone carries the status.
      await prisma.user.update({
        where: { id: teacher.userId },
        data: { isActive: false },
      });

      revalidatePath("/dashboard/admin/teachers");

      // Archiving closes the login only. Whether they still work here - and so whether
      // payroll keeps paying them - is HR's record, and saying so here is the only way the
      // person archiving them finds out.
      const stillEmployed = staffRecord?.employmentStatus === "ACTIVE";
      return {
        success: true,
        message:
          (hasAssessments
            ? "Teacher archived (has entered assessment records)"
            : "Teacher archived (has an HR staff record)") +
          (stillEmployed
            ? ". Their HR record is still active - record their exit under HR so payroll stops paying them."
            : ""),
        isArchived: true,
      };
    }

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // Delete teacher class terms
      if (teacher.teacherClassTerms.length > 0) {
        await tx.teacherClassTerm.deleteMany({
          where: { teacherId },
        });
      }

      // Delete teacher subjects
      if (teacher.teacherSubjects.length > 0) {
        await tx.teacherSubject.deleteMany({
          where: { teacherId },
        });
      }

      // Delete teacher credentials
      await tx.credential.deleteMany({
        where: { userId: teacher.userId },
      });

      // Delete the teacher record
      await tx.teacher.delete({
        where: { id: teacherId },
      });

      // Delete the user record
      await tx.user.delete({
        where: { id: teacher.userId },
      });
    });

    // Revalidate the teachers list page
    revalidatePath("/dashboard/admin/teachers");

    return { success: true };
  } catch (error) {
    console.error("Error deleting teacher:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete teacher",
    };
  }
}

// Get teacher's dashboard data
export async function getTeacherDashboardData() {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
      include: {
        school: true,
        teacherClassTerms: {
          include: {
            classTerm: {
              include: {
                class: true,
                term: true,
                students: {
                  include: {
                    student: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        teacherSubjects: {
          include: {
            subject: true,
          },
        },
      },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    return { success: true, data: teacher };
  } catch (error) {
    console.error("Error fetching teacher dashboard data:", error);
    return { success: false, error: "Failed to fetch dashboard data" };
  }
}

// Get teacher's classes with students
export async function getTeacherClasses(termId?: string) {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    const classes = await prisma.teacherClassTerm.findMany({
      where: {
        teacherId: teacher.id,
        ...(termId && { classTerm: { termId } }),
      },
      include: {
        classTerm: {
          include: {
            class: true,
            term: {
              include: {
                session: true,
              },
            },
            students: {
              include: {
                student: {
                  include: {
                    user: true,
                    transitions: {
                      orderBy: {
                        transitionDate: "desc",
                      },
                      take: 5,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return { success: true, data: classes };
  } catch (error) {
    console.error("Error fetching teacher classes:", error);
    return { success: false, error: "Failed to fetch classes" };
  }
}

// Get teacher's subjects with class information
export async function getTeacherSubjects(termId?: string) {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    const subjects = await prisma.teacherSubject.findMany({
      where: {
        teacherId: teacher.id,
      },
      include: {
        subject: {
          include: {
            classSubjects: {
              where: termId
                ? {
                    classTerm: {
                      termId,
                    },
                  }
                : {},
              include: {
                classTerm: {
                  include: {
                    class: true,
                    term: {
                      include: {
                        session: true,
                      },
                    },
                    students: {
                      include: {
                        student: {
                          include: {
                            user: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return { success: true, data: subjects };
  } catch (error) {
    console.error("Error fetching teacher subjects:", error);
    return { success: false, error: "Failed to fetch subjects" };
  }
}

// Get assessments for a specific subject and class
export async function getSubjectAssessments(
  subjectId: string,
  classTermId: string,
  termId: string,
) {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    // Verify teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId,
        termId,
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject",
      };
    }

    const assessments = await prisma.assessment.findMany({
      where: {
        subjectId,
        termId,
        studentClassTerm: { classTermId },
      },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        subject: true,
        editedByUser: {
          select: {
            firstName: true,
            lastName: true,
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

    return { success: true, data: assessments };
  } catch (error) {
    console.error("Error fetching subject assessments:", error);
    return { success: false, error: "Failed to fetch assessments" };
  }
}

// Update or create assessment
export async function updateAssessment(data: {
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
}) {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    // Verify teacher teaches this subject
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: teacher.id,
        subjectId: data.subjectId,
        termId: data.termId,
      },
    });

    if (!teacherSubject) {
      return {
        success: false,
        error: "You are not assigned to teach this subject",
      };
    }

    const enrollment = await prisma.studentClassTerm.findFirst({
      where: {
        id: data.studentClassTermId,
        studentId: data.studentId,
        termId: data.termId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        classTerm: {
          termId: data.termId,
          class: { schoolId: actor.schoolId! },
          teachers: { some: { teacherId: teacher.id } },
          classSubjects: { some: { subjectId: data.subjectId } },
        },
      },
      select: { classTerm: { select: { resultWorkflow: { select: { status: true } } } } },
    });
    if (!enrollment) return { success: false, error: "Student, class, and subject assignment do not match" };
    if (
      enrollment.classTerm.resultWorkflow?.status === "LOCKED" ||
      enrollment.classTerm.resultWorkflow?.status === "PUBLISHED"
    ) {
      return { success: false, error: "Published or locked results must be withdrawn before editing" };
    }
    assertScoresWithinScheme(data, await loadAssessmentScheme(actor.schoolId!));

    const assessment = await prisma.assessment.upsert({
      where: {
        // One score row per student, subject and term. `teacherId` records who entered it
        // and is set below, but it is not part of the identity of the row.
        studentId_subjectId_termId: {
          studentId: data.studentId,
          subjectId: data.subjectId,
          termId: data.termId,
        },
      },
      update: {
        ca1: data.ca1,
        ca2: data.ca2,
        ca3: data.ca3,
        exam: data.exam,
        isAbsent: data.isAbsent || false,
        isExempt: data.isExempt || false,
        editedBy: actor.userId,
        teacherId: teacher.id,
      },
      create: {
        studentId: data.studentId,
        subjectId: data.subjectId,
        termId: data.termId,
        studentClassTermId: data.studentClassTermId,
        ca1: data.ca1,
        ca2: data.ca2,
        ca3: data.ca3,
        exam: data.exam,
        isAbsent: data.isAbsent || false,
        isExempt: data.isExempt || false,
        editedBy: actor.userId,
        createdBy: actor.userId,
        teacherId: teacher.id,
      },
    });

    revalidatePath("/dashboard/teacher/assessments");
    return { success: true, data: assessment };
  } catch (error) {
    console.error("Error updating assessment:", error);
    return { success: false, error: "Failed to update assessment" };
  }
}

// Mark attendance
export async function markAttendance(data: {
  studentId: string;
  classTermId: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE";
}) {
  try {
    const actor = await requireTeacher();

    const targetDate = new Date(data.date);
    if (Number.isNaN(targetDate.getTime())) {
      return { success: false, error: "Invalid attendance date" };
    }

    if (!["PRESENT", "ABSENT", "LATE"].includes(data.status)) {
      return { success: false, error: "Invalid attendance status" };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    const authorizedEnrollment = await prisma.studentClassTerm.findFirst({
      where: {
        studentId: data.studentId,
        classTermId: data.classTermId,
        status: "ACTIVE",
        classTerm: {
          teachers: {
            some: {
              teacherId: teacher.id,
            },
          },
        },
      },
      select: { id: true, termId: true, term: { select: { startDate: true, endDate: true } } },
    });

    if (!authorizedEnrollment) {
      return {
        success: false,
        error: "You are not assigned to mark attendance for this student",
      };
    }

    const dayStart = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    const dayEnd = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate() + 1,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dayStart > today) {
      return { success: false, error: "Attendance cannot be marked for a future date" };
    }
    if (dayStart < authorizedEnrollment.term.startDate || dayStart > authorizedEnrollment.term.endDate) {
      return { success: false, error: "Attendance date must fall within the class term" };
    }

    const attendance = await prisma.$transaction(async (tx) => {
      const existingAttendance = await tx.attendance.findFirst({
        where: {
          studentId: data.studentId,
          date: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
      });

      if (existingAttendance) {
        return tx.attendance.update({
          where: { id: existingAttendance.id },
          data: {
            date: dayStart,
            status: data.status,
            classTermId: data.classTermId,
            termId: authorizedEnrollment.termId,
            markedBy: actor.userId,
          },
        });
      }

      return tx.attendance.create({
        data: {
          studentId: data.studentId,
          classTermId: data.classTermId,
          termId: authorizedEnrollment.termId,
          markedBy: actor.userId,
          date: dayStart,
          status: data.status,
        },
      });
    });

    revalidatePath("/dashboard/teacher/attendance");
    return { success: true, data: attendance };
  } catch (error) {
    console.error("Error marking attendance:", error);
    return { success: false, error: "Failed to mark attendance" };
  }
}

// Get attendance for a class
export async function getClassAttendance(classTermId: string, date?: string) {
  try {
    const actor = await requireTeacher();

    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    // Verify teacher is assigned to this class
    const teacherClassTerm = await prisma.teacherClassTerm.findUnique({
      where: {
        teacherId_classTermId: {
          teacherId: teacher.id,
          classTermId,
        },
      },
    });

    if (!teacherClassTerm) {
      return { success: false, error: "You are not assigned to this class" };
    }

    const targetDate = date ? new Date(date) : new Date();

    const students = await prisma.studentClassTerm.findMany({
      where: {
        classTermId,
        status: "ACTIVE",
      },
      include: {
        student: {
          include: {
            user: true,
            attendances: {
              where: {
                date: {
                  gte: new Date(
                    targetDate.getFullYear(),
                    targetDate.getMonth(),
                    targetDate.getDate(),
                  ),
                  lt: new Date(
                    targetDate.getFullYear(),
                    targetDate.getMonth(),
                    targetDate.getDate() + 1,
                  ),
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

    return { success: true, data: students };
  } catch (error) {
    console.error("Error fetching class attendance:", error);
    return { success: false, error: "Failed to fetch attendance" };
  }
}

export async function resetTeacherPassword(teacherId: string) {
  try {
    const { actor } = await requireTeacherManager();

    // Verify the teacher belongs to the admin's school
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { schoolId: true, userId: true },
    });

    if (!teacher) {
      return { success: false, error: "Teacher not found" };
    }

    try {
      assertSchoolAccess(actor, teacher.schoolId);
    } catch {
      return {
        success: false,
        error: "Unauthorized to reset password for this teacher",
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    // Update all credentials for this teacher
    await prisma.credential.updateMany({
      where: { userId: teacher.userId },
      data: { passwordHash: hashedPassword },
    });
    await revokeAllSessionsForUser(teacher.userId);

    return {
      success: true,
      data: { newPassword: temporaryPassword },
    };
  } catch (error) {
    console.error("Error resetting teacher password:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reset password",
    };
  }
}
