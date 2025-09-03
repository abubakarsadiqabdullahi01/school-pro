"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Gender, CredentialType } from "@prisma/client";
import { z } from "zod";

// Schema for credential validation
const credentialSchema = z.array(
  z.object({
    type: z.enum(["EMAIL", "PHONE", "REGISTRATION_NUMBER", "PSN"]),
    value: z.string().min(1),
    passwordHash: z.string().min(1),
    isPrimary: z.boolean(),
  })
);

// Function to hash passwords
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Common authorization check
async function checkAuthorization(allowedRoles: string[]) {
  const session = await auth();
  if (!session?.user || !allowedRoles.includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }
  return { success: true, user: session.user };
}

// Get school ID for admin or super admin
async function getSchoolId(user: { id: string; role: string }) {
  if (user.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { userId: user.id },
      select: { schoolId: true },
    });
    if (!admin?.schoolId) {
      return { success: false, error: "Admin not associated with a school" };
    }
    return { success: true, schoolId: admin.schoolId };
  }
  const school = await prisma.school.findFirst({ select: { id: true } });
  if (!school) {
    return { success: false, error: "No school found in the system" };
  }
  return { success: true, schoolId: school.id };
}

// Search for parents
export async function searchParents(query: string = "") {
  try {
    const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
    if (!authResult.success) return authResult;

    const schoolResult = await getSchoolId(authResult.user);
    if (!schoolResult.success) return schoolResult;

    const normalizedQuery = query.toLowerCase();
    const parents = await prisma.parent.findMany({
      where: {
        schoolId: schoolResult.schoolId,
        ...(query
          ? {
              OR: [
                { user: { firstName: { contains: normalizedQuery, mode: "insensitive" } } },
                { user: { lastName: { contains: normalizedQuery, mode: "insensitive" } } },
                { user: { credentials: { some: { value: { contains: normalizedQuery, mode: "insensitive" } } } } },
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
            gender: true,
            state: true,
            lga: true,
            address: true,
            credentials: { where: { type: "EMAIL" }, select: { value: true } },
          },
        },
      },
      take: 10,
    });

    const formattedParents = parents.map((parent) => ({
      id: parent.id,
      userId: parent.userId,
      firstName: parent.user.firstName,
      lastName: parent.user.lastName,
      email: parent.user.credentials[0]?.value || "",
      phone: parent.user.phone || "",
      occupation: parent.occupation || "",
      gender: parent.user.gender,
      state: parent.user.state,
      lga: parent.user.lga,
      address: parent.user.address,
    }));

    return { success: true, data: formattedParents };
  } catch (error) {
    console.error("Error searching for parents:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to search for parents" };
  }
}

// Create a new parent
export async function createParent(data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    occupation?: string;
    gender?: Gender | null;
    state?: string;
    lga?: string;
    address?: string;
    credentials?: Array<{
      type: CredentialType;
      value: string;
      passwordHash: string;
      isPrimary: boolean;
    }>;
  }) {
    try {
      const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
      if (!authResult.success) return authResult;
  
      const schoolResult = await getSchoolId(authResult.user);
      if (!schoolResult.success) return schoolResult;
  
      // Check for existing user to prevent duplicates
      const existingUser = await prisma.user.findFirst({
        where: {
          firstName: { equals: data.firstName },
          lastName: { equals: data.lastName },
          phone: data.phone || null,
          role: "PARENT",
        },
        include: { parent: { where: { schoolId: schoolResult.schoolId } } },
      });
  
      if (existingUser) {
        if (existingUser.parent) {
          return {
            success: false,
            error: `A parent with name ${data.firstName} ${data.lastName} and phone ${data.phone || "N/A"} already exists.`,
          };
        }
        const parent = await prisma.parent.create({
          data: {
            userId: existingUser.id,
            schoolId: schoolResult.schoolId,
            occupation: data.occupation,
          },
        });
        const emailCred = await prisma.credential.findFirst({
          where: { userId: existingUser.id, type: "EMAIL" },
          select: { id: true, value: true },
        });
        return {
          success: true,
          data: {
            id: parent.id,
            userId: existingUser.id,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            email: emailCred?.value || data.email || "",
            emailCredentialId: emailCred?.id || "",
            phone: existingUser.phone || data.phone || "",
            occupation: parent.occupation || "",
            gender: existingUser.gender,
            state: existingUser.state,
            lga: existingUser.lga,
            address: existingUser.address,
          },
        };
      }
  
      // Validate credentials
      if (data.credentials) {
        const parsedCredentials = credentialSchema.safeParse(data.credentials);
        if (!parsedCredentials.success) {
          return { success: false, error: "Invalid credentials format" };
        }
      }
  
      const result = await prisma.$transaction(
        async (tx) => {
          if (data.credentials) {
            for (const cred of data.credentials) {
              const existingCred = await tx.credential.findUnique({ where: { value: cred.value } });
              if (existingCred) {
                throw new Error(`A user with this ${cred.type.toLowerCase()} already exists.`);
              }
            }
          }
  
          const parentUser = await tx.user.create({
            data: {
              firstName: data.firstName,
              lastName: data.lastName,
              phone: data.phone,
              role: "PARENT",
              isActive: true,
              gender: data.gender,
              state: data.state,
              lga: data.lga,
              address: data.address,
            },
          });
  
          let emailCredentialId = "";
          if (data.credentials) {
            for (const cred of data.credentials) {
              const passwordHash = await hashPassword(cred.passwordHash);
              const newCred = await tx.credential.create({
                data: {
                  userId: parentUser.id,
                  type: cred.type,
                  value: cred.value,
                  passwordHash,
                  isPrimary: cred.isPrimary,
                },
              });
              if (cred.type === "EMAIL") emailCredentialId = newCred.id;
            }
          }
  
          const parent = await tx.parent.create({
            data: {
              userId: parentUser.id,
              schoolId: schoolResult.schoolId,
              occupation: data.occupation,
            },
          });
  
          return {
            id: parent.id,
            userId: parentUser.id,
            firstName: parentUser.firstName,
            lastName: parentUser.lastName,
            email: data.credentials?.find((c) => c.type === "EMAIL")?.value || data.email || "",
            emailCredentialId,
            phone: parentUser.phone || "",
            occupation: parent.occupation || "",
            gender: parentUser.gender,
            state: parentUser.state,
            lga: parentUser.lga,
            address: parentUser.address,
          };
        },
        { timeout: 5000 }
      );
  
      return { success: true, data: result };
    } catch (error) {
      console.error("Error creating parent:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to create parent" };
    }
  }

// Update an existing parent
export async function updateParent(data: {
  id: string;
  userId: string;
  emailCredentialId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  occupation?: string;
  gender?: Gender | null;
  state?: string;
  lga?: string;
  address?: string;
}) {
  try {
    const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
    if (!authResult.success) return authResult;

    const schoolResult = await getSchoolId(authResult.user);
    if (!schoolResult.success) return schoolResult;

    const parent = await prisma.parent.findUnique({
      where: { id: data.id },
      select: { schoolId: true },
    });

    if (!parent || (authResult.user.role === "ADMIN" && parent.schoolId !== schoolResult.schoolId)) {
      return { success: false, error: "Parent not found or unauthorized" };
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: data.userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          gender: data.gender,
          state: data.state,
          lga: data.lga,
          address: data.address,
        },
      });

      await tx.parent.update({
        where: { id: data.id },
        data: { occupation: data.occupation },
      });

      if (data.email) {
        if (data.emailCredentialId) {
          const existingCred = await tx.credential.findFirst({
            where: { value: data.email, NOT: { id: data.emailCredentialId } },
          });
          if (existingCred) {
            throw new Error("This email is already in use by another user.");
          }
          await tx.credential.update({
            where: { id: data.emailCredentialId },
            data: { value: data.email },
          });
        } else {
          const existingCred = await tx.credential.findUnique({ where: { value: data.email } });
          if (existingCred) {
            throw new Error("This email is already in use by another user.");
          }
          await tx.credential.create({
            data: {
              userId: data.userId,
              type: "EMAIL",
              value: data.email,
              passwordHash: await hashPassword(new Date().getFullYear().toString()),
              isPrimary: true,
            },
          });
        }
      }

      return { success: true };
    });

    return result;
  } catch (error) {
    console.error("Error updating parent:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update parent" };
  }
}

// Delete a parent
export async function deleteParent(parentId: string) {
  try {
    const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
    if (!authResult.success) return authResult;

    const schoolResult = await getSchoolId(authResult.user);
    if (!schoolResult.success) return schoolResult;

    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      include: { students: true },
    });

    if (!parent || (authResult.user.role === "ADMIN" && parent.schoolId !== schoolResult.schoolId)) {
      return { success: false, error: "Parent not found or unauthorized" };
    }

    if (parent.students.length > 0) {
      return { success: false, error: "Cannot delete parent with linked students. Please unlink all students first." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.credential.deleteMany({ where: { userId: parent.userId } });
      await tx.parent.delete({ where: { id: parentId } });
      await tx.user.delete({ where: { id: parent.userId } });
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting parent:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete parent" };
  }
}

// Unlink a student from a parent
export async function unlinkStudentFromParent(studentParentId: string) {
  try {
    const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
    if (!authResult.success) return authResult;

    const schoolResult = await getSchoolId(authResult.user);
    if (!schoolResult.success) return schoolResult;

    const studentParent = await prisma.studentParent.findUnique({
      where: { id: studentParentId },
      include: { parent: { select: { schoolId: true } } },
    });

    if (!studentParent || (authResult.user.role === "ADMIN" && studentParent.parent.schoolId !== schoolResult.schoolId)) {
      return { success: false, error: "Student-parent relationship not found or unauthorized" };
    }

    await prisma.studentParent.delete({ where: { id: studentParentId } });
    return { success: true };
  } catch (error) {
    console.error("Error unlinking student from parent:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unlink student from parent",
    };
  }
}

export async function getParentDetails(parentId: string) {
  try {
    const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
    if (!authResult.success) return authResult;

    const schoolResult = await getSchoolId(authResult.user);
    if (!schoolResult.success) return schoolResult;

    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            gender: true,
            state: true,
            lga: true,
            address: true,
            credentials: { where: { type: "EMAIL" }, select: { id: true, value: true } },
            createdAt: true,
          },
        },
        school: {
          select: { id: true, name: true, code: true },
        },
        students: {
          include: {
            student: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, gender: true, dateOfBirth: true },
                },
                classTerms: {
                  include: {
                    classTerm: {
                      include: {
                        class: { select: { id: true, name: true } },
                        term: { 
                          include: { 
                            session: { select: { name: true } } 
                          } 
                        },
                      },
                    },
                  },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
                assessments: {
                  include: {
                    subject: {
                      select: {
                        name: true,
                      },
                    },
                    term: {
                      select: {
                        name: true,
                      },
                    },
                  },
                  orderBy: { createdAt: "desc" },
                  take: 10,
                },
                payments: {
                  include: {
                    feeStructure: {
                      select: {
                        name: true,
                      },
                    },
                  },
                  orderBy: { paymentDate: "desc" },
                  take: 5,
                },
              },
            },
          },
        },
      },
    });

    if (!parent || (authResult.user.role === "ADMIN" && parent.schoolId !== schoolResult.schoolId)) {
      return { success: false, error: "Parent not found or unauthorized" };
    }

    const formattedParent = {
      id: parent.id,
      userId: parent.userId,
      firstName: parent.user.firstName,
      lastName: parent.user.lastName,
      fullName: `${parent.user.firstName} ${parent.user.lastName}`,
      email: parent.user.credentials[0]?.value || "",
      emailCredentialId: parent.user.credentials[0]?.id || "",
      phone: parent.user.phone || "",
      occupation: parent.occupation || "",
      gender: parent.user.gender,
      state: parent.user.state || "",
      lga: parent.user.lga || "",
      address: parent.user.address || "",
      school: {
        id: parent.school.id,
        name: parent.school.name,
        code: parent.school.code,
      },
      students: parent.students.map((sp) => {
        const latestClassTerm = sp.student.classTerms[0]?.classTerm;
        
        return {
          linkId: sp.id,
          studentId: sp.student.id,
          name: `${sp.student.user.firstName} ${sp.student.user.lastName}`,
          admissionNo: sp.student.admissionNo,
          gender: sp.student.user.gender,
          dateOfBirth: sp.student.user.dateOfBirth?.toISOString(),
          relationship: sp.relationship,
          class: latestClassTerm
            ? {
                name: latestClassTerm.class.name,
                term: latestClassTerm.term.name,
                session: latestClassTerm.term.session.name,
              }
            : null,
          assessments: sp.student.assessments.map((a) => ({
            id: a.id,
            subject: a.subject?.name || "N/A",
            // Calculate total score from individual components
            totalScore: (a.ca1 || 0) + (a.ca2 || 0) + (a.ca3 || 0) + (a.exam || 0),
            grade: "N/A", // You might want to calculate this based on your grading system
            date: a.createdAt.toISOString(),
          })),
          payments: sp.student.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            status: p.status,
            description: p.feeStructure?.name || "Fee Payment",
            date: p.paymentDate.toISOString(),
          })),
        };
      }),
      createdAt: parent.user.createdAt.toISOString(),
    };

    return { success: true, data: formattedParent };
  } catch (error) {
    console.error("Error fetching parent details:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch parent details" };
  }
}

  // Link a student to a parent
export async function linkStudentToParent(data: {
    parentId: string;
    studentId: string;
    relationship: string;
  }) {
    try {
      const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
      if (!authResult.success) return authResult;
  
      const schoolResult = await getSchoolId(authResult.user);
      if (!schoolResult.success) return schoolResult;
  
      // Verify parent exists and belongs to the school
      const parent = await prisma.parent.findUnique({
        where: { id: data.parentId },
        select: { schoolId: true },
      });
  
      if (!parent || (authResult.user.role === "ADMIN" && parent.schoolId !== schoolResult.schoolId)) {
        return { success: false, error: "Parent not found or unauthorized" };
      }
  
      // Verify student exists, belongs to the school, and is not linked to any parent
      const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: {
          schoolId: true,
          parents: { select: { id: true } },
        },
      });
  
      if (!student || (authResult.user.role === "ADMIN" && student.schoolId !== schoolResult.schoolId)) {
        return { success: false, error: "Student not found or unauthorized" };
      }
  
      if (student.parents.length > 0) {
        return { success: false, error: "Student is already linked to a parent" };
      }
  
      // Create the student-parent link
      const studentParent = await prisma.studentParent.create({
        data: {
          studentId: data.studentId,
          parentId: data.parentId,
          relationship: data.relationship,
        },
        include: {
          student: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
  
      return {
        success: true,
        data: {
          linkId: studentParent.id,
          studentId: studentParent.studentId,
          name: `${studentParent.student.user.firstName} ${studentParent.student.user.lastName}`,
          relationship: studentParent.relationship,
        },
      };
    } catch (error) {
      console.error("Error linking student to parent:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to link student to parent",
      };
    }
  }

// Get unlinked students for a school
export async function getUnlinkedStudents(schoolId: string, search?: string) {
    try {
      const authResult = await checkAuthorization(["SUPER_ADMIN", "ADMIN"]);
      if (!authResult.success) return authResult;
  
      const schoolResult = await getSchoolId(authResult.user);
      if (!schoolResult.success) return schoolResult;
  
      if (authResult.user.role === "ADMIN" && schoolId !== schoolResult.schoolId) {
        return { success: false, error: "Unauthorized to access students from this school" };
      }
  
      const students = await prisma.student.findMany({
        where: {
          schoolId,
          parents: {
            none: {}, // Only include students with no linked parents
          },
          ...(search
            ? {
                OR: [
                  { user: { firstName: { contains: search, mode: "insensitive" } } },
                  { user: { lastName: { contains: search, mode: "insensitive" } } },
                  { admissionNo: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
          classTerms: {
            include: {
              classTerm: {
                include: {
                  class: { select: { name: true } },
                  term: { select: { name: true } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
  
      const formattedStudents = students.map((student) => ({
        id: student.id,
        name: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
        className: student.classTerms[0]?.classTerm.class.name || "Not assigned",
        term: student.classTerms[0]?.classTerm.term.name || "N/A",
      }));
  
      return { success: true, data: formattedStudents };
    } catch (error) {
      console.error("Error fetching unlinked students:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch unlinked students",
      };
    }
  }