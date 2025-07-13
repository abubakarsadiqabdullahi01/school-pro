"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import type { Gender } from "@prisma/client"

// Function to hash passwords using bcrypt
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

// Function to verify passwords
async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// Generate admission number based on school configuration
export async function generateAdmissionNumber() {
  try {
    const session = await auth()
    const isNotAuthorized = !session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")
    if (isNotAuthorized) {
      return { success: false, error: "Unauthorized" }
    }

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
      const school = await prisma.school.findFirst({ select: { id: true } })
      if (!school) {
        return { success: false, error: "No school found" }
      }
      schoolId = school.id
    }

    const currentYear = new Date().getFullYear()
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: {
          admissionPrefix: true,
          admissionFormat: true,
          admissionSequenceStart: true,
        },
      })

      if (!school) throw new Error("School not found")

      let admissionSequence = await tx.admissionSequence.findUnique({
        where: { schoolId_year: { schoolId, year: currentYear } },
      })

      let nextSequence: number
      if (!admissionSequence) {
        admissionSequence = await tx.admissionSequence.create({
          data: {
            schoolId,
            year: currentYear,
            lastSequence: school.admissionSequenceStart - 1,
          },
        })
        nextSequence = school.admissionSequenceStart
      } else {
        nextSequence = admissionSequence.lastSequence + 1
      }

      await tx.admissionSequence.update({
        where: { id: admissionSequence.id },
        data: { lastSequence: nextSequence },
      })

      const admissionNo = school.admissionFormat
        .replace("{PREFIX}", school.admissionPrefix)
        .replace("{YEAR}", currentYear.toString())
        .replace("{NUMBER}", nextSequence.toString().padStart(4, "0"))

      return admissionNo
    })

    return { success: true, data: { admissionNo: result } }
  } catch (error: any) {
    // Handle unique constraint error
    if (error.code === "P2002") {
      return {
        success: false,
        error: "Admission number conflict, please retry",
      }
    }
    console.error("Error generating admission number:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function createStudent(data: {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender?: Gender | null
  state?: string
  lga?: string
  address?: string
  phone?: string
  classId: string
  termId: string
  year?: number
  parentId?: string
  relationship?: string
  isActive: boolean
  credentials?: Array<{
    type: "EMAIL" | "PHONE" | "REGISTRATION_NUMBER" | "PSN"
    value: string
    passwordHash: string
    isPrimary: boolean
  }>
}) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

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
      const school = await prisma.school.findFirst({
        select: { id: true },
      })
      if (!school) {
        return { success: false, error: "No school found in the system" }
      }
      schoolId = school.id
    }

    const classRecord = await prisma.class.findUnique({ where: { id: data.classId } })
    if (!classRecord) {
      return { success: false, error: "Invalid class selected" }
    }

    const term = await prisma.term.findUnique({ where: { id: data.termId } })
    if (!term) {
      return { success: false, error: "Invalid term selected" }
    }

    const result = await prisma.$transaction(async (tx) => {
      // === 1. Generate admission number inside transaction ===
      const currentYear = new Date().getFullYear()
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: {
          admissionPrefix: true,
          admissionFormat: true,
          admissionSequenceStart: true,
        },
      })

      if (!school) throw new Error("School not found")

      let admissionSequence = await tx.admissionSequence.findUnique({
        where: { schoolId_year: { schoolId, year: currentYear } },
      })

      let nextSequence: number
      if (!admissionSequence) {
        admissionSequence = await tx.admissionSequence.create({
          data: {
            schoolId,
            year: currentYear,
            lastSequence: school.admissionSequenceStart - 1,
          },
        })
        nextSequence = school.admissionSequenceStart
      } else {
        nextSequence = admissionSequence.lastSequence + 1
      }

      await tx.admissionSequence.update({
        where: { id: admissionSequence.id },
        data: { lastSequence: nextSequence },
      })

      const admissionNo = school.admissionFormat
        .replace("{PREFIX}", school.admissionPrefix)
        .replace("{YEAR}", currentYear.toString())
        .replace("{NUMBER}", nextSequence.toString().padStart(4, "0"))

      // === 2. Create student user ===
      const studentUser = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: "STUDENT",
          isActive: data.isActive,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender ?? null,
          state: data.state,
          lga: data.lga,
          address: data.address,
        },
      })

      if (data.credentials && data.credentials.length > 0) {
        for (const cred of data.credentials) {
          const existingCred = await tx.credential.findUnique({
            where: { value: cred.value },
          })
          if (existingCred) {
            throw new Error(`A user with this ${cred.type.toLowerCase()} already exists.`)
          }
          const passwordHash = await hashPassword(cred.passwordHash)
          await tx.credential.create({
            data: {
              userId: studentUser.id,
              type: cred.type,
              value: cred.value,
              passwordHash,
              isPrimary: cred.isPrimary,
            },
          })
        }
      }

      const student = await tx.student.create({
        data: {
          userId: studentUser.id,
          schoolId,
          admissionNo,
          year: data.year ?? currentYear,
        },
      })

      const classTerm = await tx.classTerm.findFirst({
        where: { classId: data.classId, termId: data.termId },
      })

      const classTermId = classTerm
        ? classTerm.id
        : (await tx.classTerm.create({ data: { classId: data.classId, termId: data.termId } })).id

      await tx.studentClassTerm.create({
        data: { studentId: student.id, classTermId },
      })

      if (data.parentId) {
        const parent = await tx.parent.findUnique({ where: { id: data.parentId } })
        if (!parent) {
          throw new Error("Parent does not exist")
        }
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: data.parentId,
            relationship: data.relationship || "PARENT",
          },
        })
      }

      return {
        id: student.id,
        admissionNo,
        userId: studentUser.id,
        firstName: studentUser.firstName,
        lastName: studentUser.lastName,
        classId: data.classId,
        termId: data.termId,
        parentId: data.parentId,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Error creating student:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create student",
    }
  }
}

// Update student function
export async function updateStudent(
  studentId: string,
  data: {
    firstName: string
    lastName: string
    dateOfBirth: string
    gender?: Gender | null
    state?: string
    lga?: string
    address?: string
    phone?: string
    classId?: string
    termId?: string
    year?: number
    isActive: boolean
  },
) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    let schoolId: string | undefined
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })
      if (!admin?.schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
      schoolId = admin.schoolId
    }

    // Verify student exists and belongs to the admin's school
    const existingStudent = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    })

    if (!existingStudent) {
      return { success: false, error: "Student not found" }
    }

    if (schoolId && existingStudent.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to edit this student" }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update user information
      const updatedUser = await tx.user.update({
        where: { id: existingStudent.userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          isActive: data.isActive,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender ?? null,
          state: data.state,
          lga: data.lga,
          address: data.address,
        },
      })

      // Update student information
      const updatedStudent = await tx.student.update({
        where: { id: studentId },
        data: {
          year: data.year,
        },
      })

      // Update class assignment if provided
      if (data.classId && data.termId) {
        // Find or create the class term
        let classTerm = await tx.classTerm.findFirst({
          where: { classId: data.classId, termId: data.termId },
        })

        if (!classTerm) {
          classTerm = await tx.classTerm.create({
            data: { classId: data.classId, termId: data.termId },
          })
        }

        // Check if student is already assigned to this class term
        const existingAssignment = await tx.studentClassTerm.findFirst({
          where: { studentId, classTermId: classTerm.id },
        })

        if (!existingAssignment) {
          await tx.studentClassTerm.create({
            data: { studentId, classTermId: classTerm.id },
          })
        }
      }

      return {
        id: updatedStudent.id,
        userId: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        admissionNo: updatedStudent.admissionNo,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Error updating student:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update student",
    }
  }
}

// Deactivate/Activate student function
export async function toggleStudentStatus(studentId: string) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    let schoolId: string | undefined
    if (session.user.role === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { userId: session.user.id },
        select: { schoolId: true },
      })
      if (!admin?.schoolId) {
        return { success: false, error: "Admin not associated with a school" }
      }
      schoolId = admin.schoolId
    }

    // Verify student exists and belongs to the admin's school
    const existingStudent = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    })

    if (!existingStudent) {
      return { success: false, error: "Student not found" }
    }

    if (schoolId && existingStudent.schoolId !== schoolId) {
      return { success: false, error: "Unauthorized to modify this student" }
    }

    // Toggle the active status
    const updatedUser = await prisma.user.update({
      where: { id: existingStudent.userId },
      data: {
        isActive: !existingStudent.user.isActive,
      },
    })

    return {
      success: true,
      data: {
        id: studentId,
        isActive: updatedUser.isActive,
        message: updatedUser.isActive ? "Student activated successfully" : "Student deactivated successfully",
      },
    }
  } catch (error) {
    console.error("Error toggling student status:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update student status",
    }
  }
}

// Get current session and term
export async function getCurrentSessionAndTerm() {
  try {
    const session = await prisma.session.findFirst({
      where: { isCurrent: true },
      include: {
        terms: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    })

    if (!session || !session.terms[0]) {
      return { success: false, error: "No active session or term found" }
    }

    return {
      success: true,
      data: {
        sessionId: session.id,
        sessionName: session.name,
        termId: session.terms[0].id,
        termName: session.terms[0].name,
      },
    }
  } catch (error) {
    console.error("Error fetching current session and term:", error)
    return { success: false, error: "Failed to fetch current session and term" }
  }
}

// Get all classes for a school
export async function getClasses() {
  try {
    const classes = await prisma.class.findMany({
      select: {
        id: true,
        name: true,
        level: true,
      },
    })

    return {
      success: true,
      data: classes,
    }
  } catch (error) {
    console.error("Error fetching classes:", error)
    return { success: false, error: "Failed to fetch classes" }
  }
}

// Get all students with enhanced filtering and pagination
export async function getStudents(
  filter: {
    classId?: string
    assignmentStatus?: "all" | "assigned" | "not_assigned"
    page?: number
    pageSize?: number
  } = { assignmentStatus: "all", page: 1, pageSize: 20 },
) {
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

    // Build the where clause for students
    const whereClause: any = schoolId ? { schoolId } : {}

    // Handle class filtering via StudentClassTerm
    if (filter.classId) {
      whereClause.classTerms = {
        some: {
          classTerm: {
            classId: filter.classId,
          },
        },
      }
    }

    // Handle assignment status
    if (filter.assignmentStatus === "assigned") {
      whereClause.classTerms = {
        some: {}, // At least one StudentClassTerm record exists
      }
    } else if (filter.assignmentStatus === "not_assigned") {
      whereClause.classTerms = {
        none: {}, // No StudentClassTerm records exist
      }
    }

    // Calculate pagination
    const page = filter.page || 1
    const pageSize = filter.pageSize || 20
    const skip = (page - 1) * pageSize

    // Fetch the grading system for the school
    const gradingSystem = schoolId
      ? await prisma.gradingSystem.findFirst({
          where: { schoolId, isDefault: true },
          include: {
            levels: {
              orderBy: { minScore: "asc" },
            },
          },
        })
      : null

    // Helper function to calculate grade based on total score
    function calculateGrade(totalScore: number): { grade: string; remark: string } {
      if (!gradingSystem?.levels || gradingSystem.levels.length === 0) {
        return { grade: "N/A", remark: "No grading system" }
      }

      // Sort grade levels by minScore descending to find the correct grade
      const sortedLevels = [...gradingSystem.levels].sort((a, b) => b.minScore - a.minScore)

      for (const level of sortedLevels) {
        if (totalScore >= level.minScore && totalScore <= level.maxScore) {
          return { grade: level.grade, remark: level.remark }
        }
      }

      // If no grade found, return lowest grade or default
      const lowestGrade = sortedLevels[sortedLevels.length - 1]
      return { grade: lowestGrade?.grade || "F9", remark: lowestGrade?.remark || "Fail" }
    }

    // Query students with pagination
    const students = await prisma.student.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
            state: true,
            lga: true,
            address: true,
            phone: true,
            isActive: true,
          },
        },
        classTerms: {
          include: {
            classTerm: {
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                term: {
                  select: {
                    id: true,
                    name: true,
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
          orderBy: { createdAt: "desc" },
          take: 1, // Get the most recent class-term assignment
        },
        parents: {
          take: 1,
          include: {
            parent: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        assessments: {
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
            subject: {
              select: {
                id: true,
                name: true,
              },
            },
            term: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            paymentDate: true,
          },
          take: 5,
          orderBy: { paymentDate: "desc" },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: pageSize,
    })

    // Get total count for pagination
    const totalStudents = await prisma.student.count({
      where: whereClause,
    })

    // Fetch unique classes for filtering
    const classes = await prisma.class.findMany({
      where: schoolId ? { schoolId } : undefined,
      select: {
        id: true,
        name: true,
      },
      orderBy: [{ name: "asc" }],
    })

    // Transform the data for the frontend
    const formattedStudents = students.map((student) => ({
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      fullName: `${student.user.firstName} ${student.user.lastName}`,
      dateOfBirth: student.user.dateOfBirth?.toISOString().split("T")[0] || "",
      gender: student.user.gender || "Not Specified",
      state: student.user.state || "Not Specified",
      lga: student.user.lga || "Not Specified",
      address: student.user.address || "Not Specified",
      phone: student.user.phone || "",
      year: student.year || null,
      isActive: student.user.isActive,
      class: student.classTerms.length > 0 ? student.classTerms[0].classTerm.class.name : "Not Assigned",
      term: student.classTerms.length > 0 ? student.classTerms[0].classTerm.term.name : "Not Assigned",
      session: student.classTerms.length > 0 ? student.classTerms[0].classTerm.term.session.name : "Not Assigned",
      parentName:
        student.parents.length > 0
          ? `${student.parents[0].parent.user.firstName} ${student.parents[0].parent.user.lastName}`
          : "Not Assigned",
      registrationDate: student.createdAt.toISOString().split("T")[0],
      recentAssessments: student.assessments.map((a) => {
        // Calculate total score from individual components
        const ca1 = a.ca1 || 0
        const ca2 = a.ca2 || 0
        const ca3 = a.ca3 || 0
        const exam = a.exam || 0
        const totalScore = ca1 + ca2 + ca3 + exam

        // Calculate grade dynamically using grading system
        const gradeInfo = calculateGrade(totalScore)

        // Handle special cases
        let displayScore = totalScore.toString()
        let displayGrade = gradeInfo.grade

        if (a.isAbsent) {
          displayScore = "ABS"
          displayGrade = "ABS"
        } else if (a.isExempt) {
          displayScore = "EXM"
          displayGrade = "EXM"
        } else if (!a.isPublished) {
          displayScore = "UNPUB"
          displayGrade = "UNPUB"
        }

        return {
          id: a.id,
          subject: a.subject?.name || "N/A",
          totalScore: displayScore,
          grade: displayGrade,
          remark: gradeInfo.remark,
          term: a.term?.name || "N/A",
          ca1: a.ca1,
          ca2: a.ca2,
          ca3: a.ca3,
          exam: a.exam,
          isAbsent: a.isAbsent,
          isExempt: a.isExempt,
          isPublished: a.isPublished,
        }
      }),
      recentPayments: student.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        paymentDate: p.paymentDate.toISOString().split("T")[0],
      })),
    }))

    return {
      success: true,
      data: {
        students: formattedStudents,
        classes: classes.map((c) => ({ id: c.id, name: c.name })),
        pagination: {
          page,
          pageSize,
          total: totalStudents,
          totalPages: Math.ceil(totalStudents / pageSize),
        },
      },
    }
  } catch (error) {
    console.error("Error fetching students:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch students",
    }
  }
}

// Get a specific student by ID
export async function getStudent(id: string) {
  try {
    const session = await auth()
    if (!session?.user) {
      return { success: false, error: "Unauthorized" }
    }

    let student
    if (session.user.role === "SUPER_ADMIN" || session.user.role === "ADMIN") {
      student = await prisma.student.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              state: true,
              lga: true,
              address: true,
              phone: true,
              isActive: true,
            },
          },
          classTerms: {
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
            orderBy: { createdAt: "desc" },
          },
          parents: {
            include: {
              parent: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
          assessments: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
              term: {
                select: {
                  id: true,
                  name: true,
                  session: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentDate: true,
              receiptNo: true,
            },
            orderBy: { paymentDate: "desc" },
          },
        },
      })
    } else if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!teacher) {
        return { success: false, error: "Teacher record not found" }
      }

      const teacherClassTerms = await prisma.teacherClassTerm.findMany({
        where: { teacherId: teacher.id },
        select: { classTermId: true },
      })
      const classTermIds = teacherClassTerms.map((tct) => tct.classTermId)

      student = await prisma.student.findFirst({
        where: {
          id,
          classTerms: { some: { classTermId: { in: classTermIds } } },
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              state: true,
              lga: true,
              address: true,
              phone: true,
              isActive: true,
            },
          },
          classTerms: {
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
            orderBy: { createdAt: "desc" },
          },
          parents: {
            include: {
              parent: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
          assessments: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
              term: {
                select: {
                  id: true,
                  name: true,
                  session: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentDate: true,
              receiptNo: true,
            },
            orderBy: { paymentDate: "desc" },
          },
        },
      })
    } else if (session.user.role === "PARENT") {
      const parent = await prisma.parent.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!parent) {
        return { success: false, error: "Parent record not found" }
      }

      const studentParent = await prisma.studentParent.findFirst({
        where: {
          parentId: parent.id,
          studentId: id,
        },
      })
      if (!studentParent) {
        return { success: false, error: "Unauthorized to view this student" }
      }

      student = await prisma.student.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              state: true,
              lga: true,
              address: true,
              phone: true,
              isActive: true,
            },
          },
          classTerms: {
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
            orderBy: { createdAt: "desc" },
          },
          assessments: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
              term: {
                select: {
                  id: true,
                  name: true,
                  session: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentDate: true,
              receiptNo: true,
            },
            orderBy: { paymentDate: "desc" },
          },
        },
      })
    } else if (session.user.role === "STUDENT") {
      const studentRecord = await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!studentRecord || studentRecord.id !== id) {
        return { success: false, error: "Unauthorized to view this student" }
      }

      student = await prisma.student.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              state: true,
              lga: true,
              address: true,
              phone: true,
              isActive: true,
            },
          },
          classTerms: {
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
            orderBy: { createdAt: "desc" },
          },
          parents: {
            include: {
              parent: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
          assessments: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
              term: {
                select: {
                  id: true,
                  name: true,
                  session: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentDate: true,
              receiptNo: true,
            },
            orderBy: { paymentDate: "desc" },
          },
        },
      })
    }

    if (!student) {
      return { success: false, error: "Student not found" }
    }

    // Format the student data for the frontend
    const formattedStudent = {
      id: student.id,
      userId: student.userId,
      admissionNo: student.admissionNo,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      fullName: `${student.user.firstName} ${student.user.lastName}`,
      dateOfBirth: student.user.dateOfBirth?.toISOString().split("T")[0] || "",
      gender: student.user.gender || "Not Specified",
      state: student.user.state || "Not Specified",
      lga: student.user.lga || "Not Specified",
      address: student.user.address || "Not Specified",
      phone: student.user.phone || "",
      year: student.year || null,
      isActive: student.user.isActive,
      currentClass:
        student.classTerms.length > 0
          ? {
              id: student.classTerms[0].classTerm.classId,
              name: student.classTerms[0].classTerm.class.name,
              termId: student.classTerms[0].classTerm.termId,
              termName: student.classTerms[0].classTerm.term.name,
              sessionName: student.classTerms[0].classTerm.term.session.name,
            }
          : null,
      parents: student.parents
        ? student.parents.map((sp) => ({
            id: sp.parentId,
            name: `${sp.parent.user.firstName} ${sp.parent.user.lastName}`,
            relationship: sp.relationship,
            phone: sp.parent.user.phone || "",
          }))
        : [],
      academicHistory: student.classTerms.map((sct) => ({
        id: sct.classTermId,
        className: sct.classTerm.class.name,
        termName: sct.classTerm.term.name,
        sessionName: sct.classTerm.term.session.name,
        startDate: sct.classTerm.term.startDate,
        endDate: sct.classTerm.term.endDate,
      })),
      assessments: student.assessments.map((a) => {
        const ca1 = a.ca1 || 0
        const ca2 = a.ca2 || 0
        const ca3 = a.ca3 || 0
        const exam = a.exam || 0
        const totalScore = ca1 + ca2 + ca3 + exam

        return {
          id: a.id,
          subject: a.subject?.name || "N/A",
          ca1: a.ca1,
          ca2: a.ca2,
          ca3: a.ca3,
          exam: a.exam,
          totalScore: a.isAbsent ? "ABS" : a.isExempt ? "EXM" : !a.isPublished ? "UNPUB" : totalScore.toString(),
          term: a.term?.name || "N/A",
          session: a.term?.session?.name || "N/A",
          isAbsent: a.isAbsent,
          isExempt: a.isExempt,
          isPublished: a.isPublished,
          createdAt: a.createdAt.toISOString().split("T")[0],
        }
      }),
      payments: student.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        paymentDate: p.paymentDate.toISOString().split("T")[0],
        receiptNo: p.receiptNo,
      })),
      createdAt: student.createdAt,
    }

    return {
      success: true,
      data: formattedStudent,
    }
  } catch (error) {
    console.error(`Error fetching student with ID ${id}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch student",
    }
  }
}

// Authenticate a parent
export async function authenticateParent(identifier: string, password: string) {
  try {
    const credential = await prisma.credential.findFirst({
      where: {
        OR: [
          { type: "EMAIL", value: identifier },
          { type: "PHONE", value: identifier },
        ],
      },
      include: {
        user: {
          include: {
            parent: true,
          },
        },
      },
    })

    if (!credential) {
      return { success: false, error: "Invalid credentials" }
    }

    const isPasswordValid = await verifyPassword(password, credential.passwordHash)
    if (!isPasswordValid) {
      await prisma.loginAttempt.create({
        data: {
          credentialId: credential.id,
          userId: credential.userId,
          ipAddress: "127.0.0.1",
          status: "FAILED_PASSWORD",
        },
      })
      return { success: false, error: "Invalid credentials" }
    }

    if (!credential.user.parent) {
      return { success: false, error: "Account is not a parent account" }
    }

    const parentId = credential.user.parent.id
    const children = await prisma.studentParent.findMany({
      where: { parentId },
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            classTerms: {
              include: {
                classTerm: {
                  include: {
                    class: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    })

    await prisma.loginAttempt.create({
      data: {
        credentialId: credential.id,
        userId: credential.userId,
        ipAddress: "127.0.0.1",
        status: "SUCCESS",
      },
    })

    const sessionToken = crypto.randomBytes(32).toString("hex")
    await prisma.loginSession.create({
      data: {
        userId: credential.userId,
        credentialId: credential.id,
        ipAddress: "127.0.0.1",
        sessionToken,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    const parentData = {
      id: parentId,
      userId: credential.userId,
      firstName: credential.user.firstName,
      lastName: credential.user.lastName,
      email: credential.type === "EMAIL" ? credential.value : null,
      phone: credential.type === "PHONE" ? credential.value : null,
      children: children.map((sp) => ({
        id: sp.student.id,
        name: `${sp.student.user.firstName} ${sp.student.user.lastName}`,
        class: sp.student.classTerms.length > 0 ? sp.student.classTerms[0].classTerm.class.name : "Not Assigned",
        relationship: sp.relationship,
      })),
      sessionToken,
    }

    return { success: true, data: parentData }
  } catch (error) {
    console.error("Error authenticating parent:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid credentials",
    }
  }
}

// Search for parents
export async function searchParents(query = "") {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

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

    const normalizedQuery = query.toLowerCase()
    const parents = await prisma.parent.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        ...(query
          ? {
              OR: [
                { user: { firstName: { contains: normalizedQuery } } },
                { user: { lastName: { contains: normalizedQuery } } },
                { user: { credentials: { some: { value: { contains: normalizedQuery } } } } },
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
      },
      take: 10,
    })

    const formattedParents = parents.map((parent) => ({
      id: parent.id,
      userId: parent.userId,
      firstName: parent.user.firstName,
      lastName: parent.user.lastName,
      email: parent.user.credentials.length > 0 ? parent.user.credentials[0].value : "",
      phone: parent.user.phone || "",
      occupation: parent.occupation || "",
      gender: parent.user.gender,
      state: parent.user.state,
      lga: parent.user.lga,
      address: parent.user.address,
    }))

    return { success: true, data: formattedParents }
  } catch (error) {
    console.error("Error searching for parents:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to search for parents",
    }
  }
}
