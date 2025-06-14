"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { calculateGrade } from "@/lib/grading"
import type { GradingSystem } from "@/lib/grading"

// Enhanced authorization function
async function authorizeAndGetSchoolId(): Promise<string | undefined> {
  const session = await auth()
  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }
  if (session.user.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
      select: { schoolId: true },
    })
    if (!admin?.schoolId) {
      throw new Error("Admin not assigned to a school")
    }
    return admin.schoolId
  }
  return undefined
}

// Get subjects for a class term
export async function getClassTermSubjects(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Verify access to the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
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
      orderBy: {
        subject: {
          name: "asc",
        },
      },
    })

    // Format the response
    const formattedSubjects = classSubjects.map((classSubject) => ({
      id: classSubject.subject.id,
      name: classSubject.subject.name,
      code: classSubject.subject.code,
      classSubjectId: classSubject.id,
    }))

    return { success: true, data: formattedSubjects }
  } catch (error) {
    console.error("Failed to get subjects for class term:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get comprehensive class term results
export async function getClassTermResults(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Verify access to the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
        term: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    // Get grading system for the school
    const gradingSystemData = await prisma.gradingSystem.findFirst({
      where: {
        schoolId: schoolId || classTerm.class.schoolId,
        isDefault: true,
      },
      include: {
        levels: {
          orderBy: { minScore: "desc" },
        },
      },
    })

    const gradingSystem: GradingSystem = gradingSystemData
      ? {
          levels: gradingSystemData.levels.map((level) => ({
            minScore: level.minScore,
            maxScore: level.maxScore,
            grade: level.grade,
            remark: level.remark,
          })),
          passMark: gradingSystemData.passMark,
        }
      : {
          levels: [
            { minScore: 80, maxScore: 100, grade: "A1", remark: "Excellent" },
            { minScore: 70, maxScore: 79, grade: "A2", remark: "Very Good" },
            { minScore: 60, maxScore: 69, grade: "B1", remark: "Good" },
            { minScore: 50, maxScore: 59, grade: "B2", remark: "Fair" },
            { minScore: 45, maxScore: 49, grade: "C1", remark: "Pass" },
            { minScore: 40, maxScore: 44, grade: "C2", remark: "Weak Pass" },
            { minScore: 0, maxScore: 39, grade: "F", remark: "Fail" },
          ],
          passMark: 40,
        }

    // Get all students in this class term with their assessments
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
        assessments: {
          where: {
            termId: classTerm.term.id,
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
        },
      },
      orderBy: {
        student: {
          user: {
            firstName: "asc",
          },
        },
      },
    })

    // Calculate results for each student
    const results = studentClassTerms.map((sct) => {
      const student = sct.student
      const assessments = sct.assessments

      // Group assessments by subject
      const subjectScores: Record<string, { score: number | null; grade: string | null }> = {}
      let totalScore = 0
      let subjectCount = 0

      assessments.forEach((assessment) => {
        if (!assessment.isAbsent && !assessment.isExempt) {
          const subjectTotal =
            (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0)

          const gradeResult = calculateGrade(subjectTotal, gradingSystem)

          subjectScores[assessment.subject.id] = {
            score: subjectTotal,
            grade: gradeResult.grade,
          }

          totalScore += subjectTotal
          subjectCount++
        } else {
          subjectScores[assessment.subject.id] = {
            score: null,
            grade: null,
          }
        }
      })

      const averageScore = subjectCount > 0 ? totalScore / subjectCount : 0
      const overallGradeResult = calculateGrade(averageScore, gradingSystem)

      return {
        studentId: student.id,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
        gender: student.user.gender || "OTHER",
        subjects: subjectScores,
        totalScore,
        averageScore,
        grade: overallGradeResult.grade,
        position: 0, // Will be calculated after sorting
      }
    })

    // Sort by average score (descending) and assign positions
    results.sort((a, b) => b.averageScore - a.averageScore)

    let currentPosition = 1
    let previousScore = -1
    let studentsAtSameRank = 0

    results.forEach((result, index) => {
      if (result.averageScore !== previousScore) {
        currentPosition = index + 1
        studentsAtSameRank = 1
      } else {
        studentsAtSameRank++
      }

      result.position = currentPosition
      previousScore = result.averageScore
    })

    return { success: true, data: results }
  } catch (error) {
    console.error("Failed to get class term results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get grading system for a school
export async function getGradingSystem(schoolId: string) {
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
    })

    if (!gradingSystem) {
      return {
        success: false,
        error: "No grading system found for this school",
      }
    }

    return { success: true, data: gradingSystem }
  } catch (error) {
    console.error("Failed to get grading system:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}
