"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import type { Gender } from "@prisma/client"

// Search for teachers
export async function searchTeachers(query = "") {
  try {
    // Get the current user session
    const session = await auth()

    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get the admin's school ID if applicable
    let schoolId: string | undefined

    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })

      schoolId = admin?.schoolId

      if (!schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
    }

    // Search for teachers based on the query
    const teachers = await prisma.teacher.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        ...(query
          ? {
              OR: [
                { user: { firstName: { contains: query, mode: "insensitive" } } },
                { user: { lastName: { contains: query, mode: "insensitive" } } },
                { user: { credentials: { some: { value: { contains: query, mode: "insensitive" } } } } },
                { staffId: { contains: query, mode: "insensitive" } },
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
    })

    // Format the results
    const formattedTeachers = teachers.map((teacher) => ({
      id: teacher.id,
      userId: teacher.userId,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      email: teacher.user.credentials.length > 0 ? teacher.user.credentials[0].value : "",
      phone: teacher.user.phone || "",
      staffId: teacher.staffId,
      department: teacher.department || "",
      gender: teacher.user.gender,
      state: teacher.user.state,
      lga: teacher.user.lga,
      address: teacher.user.address,
      schoolName: teacher.school.name,
      classesCount: teacher.teacherClassTerms.length,
      subjectsCount: teacher.teacherSubjects.length,
    }))

    return {
      success: true,
      data: formattedTeachers,
    }
  } catch (error) {
    console.error("Error searching for teachers:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to search for teachers",
    }
  }
}

// Create a new teacher
export async function createTeacher(data: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    staffId: string
    department?: string
    qualification?: string
    gender?: Gender | null
    state?: string
    lga?: string
    address?: string
    dateOfBirth?: string
    credentials?: Array<{
      type: "EMAIL" | "PHONE" | "STAFF_ID" | "PSN"
      value: string
      passwordHash: string
      isPrimary: boolean
    }>
  }) {
    try {
      // Get the current user session
      const session = await auth()
  
      if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
        return { success: false, error: "Unauthorized" }
      }
  
      // Get the admin's school ID
      let schoolId: string
  
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          select: { schoolId: true },
        })
  
        if (!admin?.schoolId) {
          return { success: false, error: "Admin not associated with a school" }
        }
  
        schoolId = admin.schoolId
      } else {
        // For super admin, we need to determine the school ID
        // For now, we'll use the first school in the system
        const school = await prisma.school.findFirst({
          select: { id: true },
        })
  
        if (!school) {
          return { success: false, error: "No school found in the system" }
        }
  
        schoolId = school.id
      }
  
      // Check if staffId already exists
      const existingTeacher = await prisma.teacher.findFirst({
        where: {
          staffId: data.staffId,
          schoolId,
        },
      })
  
      if (existingTeacher) {
        return {
          success: false,
          error: `A teacher with staff ID "${data.staffId}" already exists.`,
        }
      }
  
      // Check if credentials already exist
      if (data.credentials && data.credentials.length > 0) {
        for (const cred of data.credentials) {
          const existingCred = await prisma.credential.findUnique({
            where: {
              value: cred.value,
            },
          })
  
          if (existingCred) {
            return {
              success: false,
              error: `A user with this ${cred.type.toLowerCase()} already exists. Please use a different ${cred.type.toLowerCase()}.`,
            }
          }
        }
      }
  
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
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          },
        })
  
        // Create teacher credentials if provided
        if (data.credentials && data.credentials.length > 0) {
          for (const cred of data.credentials) {
            // Hash the password using bcrypt
            const passwordHash = await bcrypt.hash(cred.passwordHash, 10)
  
            await tx.credential.create({
              data: {
                userId: teacherUser.id,
                type: cred.type,
                value: cred.value,
                passwordHash,
                isPrimary: cred.isPrimary,
              },
            })
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
        })
  
        // Get email from credentials if available
        let email = ""
        if (data.credentials) {
          const emailCred = data.credentials.find((cred) => cred.type === "EMAIL")
          if (emailCred) {
            email = emailCred.value
          }
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
        }
      })
  
      // Revalidate the teachers list page
      revalidatePath("/dashboard/admin/teachers")
  
      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error("Error creating teacher:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create teacher",
      }
    }
  }

// Get all teachers
export async function getTeachers() {
    try {
      // Get the current user session
      const session = await auth()
  
      if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
        return { success: false, error: "Unauthorized" }
      }
  
      // Get the admin's school ID if applicable
      let schoolId: string | undefined
  
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          select: { schoolId: true },
        })
  
        schoolId = admin?.schoolId
  
        if (!schoolId) {
          return { success: false, error: "Admin not associated with a school" }
        }
      }
  
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
              gender: true,
              dateOfBirth: true,
              createdAt: true,
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
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
  
      // Format the teachers for the response
      const formattedTeachers = teachers.map((teacher) => ({
        id: teacher.id,
        userId: teacher.userId,
        firstName: teacher.user.firstName,
        lastName: teacher.user.lastName,
        fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
        email: teacher.user.credentials.length > 0 ? teacher.user.credentials[0].value : "",
        phone: teacher.user.phone || "",
        staffId: teacher.staffId,
        department: teacher.department || "",
        qualification: teacher.qualification || "",
        gender: teacher.user.gender,
        dateOfBirth: teacher.user.dateOfBirth,
        school: {
          id: teacher.school.id,
          name: teacher.school.name,
          code: teacher.school.code,
        },
        classesCount: teacher.teacherClassTerms.length,
        subjectsCount: teacher.teacherSubjects.length,
        classes: teacher.teacherClassTerms.map((tct) => ({
          id: tct.id,
          className: tct.classTerm.class.name,
          termName: tct.classTerm.term.name,
          sessionName: tct.classTerm.term.session.name,
        })),
        subjects: teacher.teacherSubjects.map((ts) => ({
          id: ts.id,
          name: ts.subject.name,
          code: ts.subject.code,
        })),
        createdAt: teacher.createdAt,
      }))

  
      return {
        success: true,
        data: formattedTeachers,
      }
    } catch (error) {
      console.error("Error fetching teachers:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch teachers",
      }
    }
  }


// Get a specific teacher by ID
export async function getTeacher(id: string) {
    try {
      // Get the current user session
      const session = await auth()
  
      if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
        return { success: false, error: "Unauthorized" }
      }
  
      // Get the admin's school ID if applicable
      let schoolId: string | undefined
  
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          select: { schoolId: true },
        })
  
        schoolId = admin?.schoolId
  
        if (!schoolId) {
          return { success: false, error: "Admin not associated with a school" }
        }
      }
  
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
            },
          },
        },
      })
  
      if (!teacher) {
        return { success: false, error: "Teacher not found" }
      }
  
      // Ensure the teacher belongs to the admin's school if admin
      if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
        return { success: false, error: "Unauthorized to view this teacher" }
      }
  
      // Format the teacher for the response
      const formattedTeacher = {
        id: teacher.id,
        userId: teacher.userId,
        firstName: teacher.user.firstName,
        lastName: teacher.user.lastName,
        fullName: `${teacher.user.firstName} ${teacher.user.lastName}`,
        email: teacher.user.credentials.length > 0 ? teacher.user.credentials[0].value : "",
        emailCredentialId: teacher.user.credentials.length > 0 ? teacher.user.credentials[0].id : "",
        phone: teacher.user.phone || "",
        staffId: teacher.staffId,
        department: teacher.department || "",
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
        classes: teacher.teacherClassTerms.map((tct) => ({
          id: tct.id,
          classTermId: tct.classTermId,
          className: tct.classTerm.class.name,
          termName: tct.classTerm.term.name,
          sessionName: tct.classTerm.term.session.name,
        })),
        subjects: teacher.teacherSubjects.map((ts) => ({
          id: ts.id,
          subjectId: ts.subjectId,
          name: ts.subject.name,
          code: ts.subject.code,
        })),
        createdAt: teacher.createdAt,
      }
  
      return {
        success: true,
        data: formattedTeacher,
      }
    } catch (error) {
      console.error("Error fetching teacher:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch teacher",
      }
    }
  }
  

// Update an existing teacher
export async function updateTeacher(data: {
    id: string
    userId: string
    emailCredentialId?: string
    firstName: string
    lastName: string
    email?: string
    phone?: string
    staffId: string
    position?: string
    qualification?: string
    gender?: Gender | null
    dateOfBirth?: string
    state?: string
    lga?: string
    address?: string
  }) {
    try {
      // Get the current user session
      const session = await auth()
  
      if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
        return { success: false, error: "Unauthorized" }
      }
  
      // Get the admin's school ID if applicable
      let schoolId: string | undefined
  
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          select: { schoolId: true },
        })
  
        schoolId = admin?.schoolId
  
        if (!schoolId) {
          return { success: false, error: "Admin not associated with a school" }
        }
      }
  
      // Verify the teacher belongs to the admin's school
      const teacher = await prisma.teacher.findUnique({
        where: { id: data.id },
        select: { schoolId: true, staffId: true },
      })
  
      if (!teacher) {
        return { success: false, error: "Teacher not found" }
      }
  
      if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
        return { success: false, error: "Unauthorized to update this teacher" }
      }
  
      // Check if the staff ID is being changed and if it already exists for another teacher
      if (data.staffId !== teacher.staffId) {
        const existingTeacher = await prisma.teacher.findFirst({
          where: {
            staffId: data.staffId,
            schoolId: teacher.schoolId,
            id: { not: data.id },
          },
        })
  
        if (existingTeacher) {
          return {
            success: false,
            error: `A teacher with staff ID "${data.staffId}" already exists.`,
          }
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
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
            state: data.state,
            lga: data.lga,
            address: data.address,
          },
        })
  
        // Update the teacher record
        await tx.teacher.update({
          where: { id: data.id },
          data: {
            staffId: data.staffId,
            department: data.position,
            qualification: data.qualification,
          },
        })
  
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
            })
  
            if (existingCred) {
              throw new Error("This email is already in use by another user.")
            }
  
            // Update existing email credential
            await tx.credential.update({
              where: { id: data.emailCredentialId },
              data: {
                value: data.email,
              },
            })
          } else {
            // Check if the email is already in use
            const existingCred = await tx.credential.findUnique({
              where: {
                value: data.email,
              },
            })
  
            if (existingCred) {
              throw new Error("This email is already in use by another user.")
            }
  
            // Create new email credential
            const currentYear = new Date().getFullYear().toString()
            const passwordHash = await bcrypt.hash(currentYear, 10)
            await tx.credential.create({
              data: {
                userId: data.userId,
                type: "EMAIL",
                value: data.email,
                passwordHash,
                isPrimary: true,
              },
            })
          }
        }
  
        return { success: true }
      })
  
      // Revalidate the teachers list page
      revalidatePath("/dashboard/admin/teachers")
      revalidatePath(`/dashboard/admin/teachers/${data.id}`)
  
      return { success: true }
    } catch (error) {
      console.error("Error updating teacher:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update teacher",
      }
    }
  }

// Delete a teacher
export async function deleteTeacher(teacherId: string) {
    try {
      // Get the current user session
      const session = await auth()
  
      if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
        return { success: false, error: "Unauthorized" }
      }
  
      // Get the admin's school ID if applicable
      let schoolId: string | undefined
  
      if (session.user.role === "ADMIN") {
        const admin = await prisma.admin.findUnique({
          where: { userId: session.user.id },
          select: { schoolId: true },
        })
  
        schoolId = admin?.schoolId
  
        if (!schoolId) {
          return { success: false, error: "Admin not associated with a school" }
        }
      }
  
      // Verify the teacher belongs to the admin's school
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        include: {
          classTerms: true,
          subjects: true,
        },
      })
  
      if (!teacher) {
        return { success: false, error: "Teacher not found" }
      }
  
      if (session.user.role === "ADMIN" && teacher.schoolId !== schoolId) {
        return { success: false, error: "Unauthorized to delete this teacher" }
      }
  
      // Start a transaction
      await prisma.$transaction(async (tx) => {
        // Delete teacher class terms
        if (teacher.classTerms.length > 0) {
          await tx.teacherClassTerm.deleteMany({
            where: { teacherId },
          })
        }
  
        // Delete teacher subjects
        if (teacher.subjects.length > 0) {
          await tx.teacherSubject.deleteMany({
            where: { teacherId },
          })
        }
  
        // Delete teacher credentials
        await tx.credential.deleteMany({
          where: { userId: teacher.userId },
        })
  
        // Delete the teacher record
        await tx.teacher.delete({
          where: { id: teacherId },
        })
  
        // Delete the user record
        await tx.user.delete({
          where: { id: teacher.userId },
        })
      })
  
      // Revalidate the teachers list page
      revalidatePath("/dashboard/admin/teachers")
  
      return { success: true }
    } catch (error) {
      console.error("Error deleting teacher:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete teacher",
      }
    }
  }