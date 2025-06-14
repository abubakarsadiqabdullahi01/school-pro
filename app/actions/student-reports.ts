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

// Get comprehensive student report data
export async function getStudentReportData(studentId: string, termId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Get student information
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            gender: true,
          },
        },
      },
    })

    if (!student) {
      throw new Error("Student not found")
    }

    // Verify school access
    if (schoolId && student.schoolId !== schoolId) {
      throw new Error("Student does not belong to admin's school")
    }

    // Get term information
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: {
        session: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!term) {
      throw new Error("Term not found")
    }

    if (schoolId && term.session.schoolId !== schoolId) {
      throw new Error("Term does not belong to admin's school")
    }

    // Get the student's class term for this term
    const studentClassTerm = await prisma.studentClassTerm.findFirst({
      where: {
        studentId,
        classTerm: {
          termId,
        },
      },
      include: {
        classTerm: {
          include: {
            classSubjects: {
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
        },
      },
    })

    if (!studentClassTerm) {
      throw new Error("Student not found in any class for this term")
    }

    // Get grading system for the school
    const gradingSystemData = await prisma.gradingSystem.findFirst({
      where: {
        schoolId: schoolId || term.session.schoolId,
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

    // Get all subjects for this class term
    const allSubjects = studentClassTerm.classTerm.classSubjects.map((cs) => cs.subject)

    // Get student's assessments for this term
    const assessments = await prisma.assessment.findMany({
      where: {
        studentId,
        termId,
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
    })

    // Get all assessments for the class to calculate subject positions and statistics
    const classAssessments = await prisma.assessment.findMany({
      where: {
        termId,
        studentClassTerm: {
          classTermId: studentClassTerm.classTerm.id,
        },
      },
      include: {
        student: {
          select: {
            id: true,
          },
        },
        subject: {
          select: {
            id: true,
          },
        },
      },
    })

    // Calculate subject statistics and positions
    const subjectStats = calculateSubjectStatistics(classAssessments, allSubjects)
    const subjectPositions = calculateSubjectPositions(classAssessments, studentId, allSubjects)

    // Create a map of assessments by subject ID
    const assessmentMap = new Map(assessments.map((a) => [a.subjectId, a]))

    // Initialize subjects object with all subjects
    const subjects: Record<string, any> = {}
    let totalScore = 0
    let subjectCount = 0

    // Process each subject in the class
    allSubjects.forEach((subject) => {
      const assessment = assessmentMap.get(subject.id)
      const stats = subjectStats[subject.id]
      const position = subjectPositions[subject.id]

      if (assessment && !assessment.isAbsent && !assessment.isExempt) {
        // Student has assessment and is not absent/exempt
        const ca1 = assessment.ca1 || 0
        const ca2 = assessment.ca2 || 0
        const ca3 = assessment.ca3 || 0
        const exam = assessment.exam || 0
        const subjectTotal = ca1 + ca2 + ca3 + exam

        const gradeResult = calculateGrade(subjectTotal, gradingSystem)

        subjects[subject.id] = {
          ca1,
          ca2,
          ca3,
          exam,
          score: subjectTotal,
          grade: gradeResult.grade,
          remark: gradeResult.remark,
          position: position,
          outOf: stats.totalStudents,
          lowest: stats.lowest,
          highest: stats.highest,
          average: stats.average,
        }

        totalScore += subjectTotal
        subjectCount++
      } else if (assessment) {
        // Student has assessment but is absent or exempt
        subjects[subject.id] = {
          ca1: null,
          ca2: null,
          ca3: null,
          exam: null,
          score: null,
          grade: null,
          remark: assessment.isAbsent ? "Absent" : "Exempt",
          position: null,
          outOf: stats.totalStudents,
          lowest: stats.lowest,
          highest: stats.highest,
          average: stats.average,
        }
      } else {
        // No assessment record for this subject
        subjects[subject.id] = {
          ca1: null,
          ca2: null,
          ca3: null,
          exam: null,
          score: null,
          grade: null,
          remark: "Not Taken",
          position: null,
          outOf: stats.totalStudents,
          lowest: stats.lowest,
          highest: stats.highest,
          average: stats.average,
        }
      }
    })

    const averageScore = subjectCount > 0 ? totalScore / subjectCount : 0
    const overallGradeResult = calculateGrade(averageScore, gradingSystem)

    // Get student's position in class
    const position = await calculateStudentPosition(studentId, termId)

    const studentResult = {
      studentId: student.id,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      admissionNo: student.admissionNo,
      gender: student.user.gender || "OTHER",
      subjects,
      totalScore,
      averageScore,
      grade: overallGradeResult.grade,
      remark: overallGradeResult.remark,
      position,
      gradingSystem, // Include grading system for use in PDF generation
    }

    return { success: true, data: studentResult }
  } catch (error) {
    console.error("Failed to get student report data:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Calculate subject-specific statistics
function calculateSubjectStatistics(
  classAssessments: any[],
  allSubjects: any[],
): Record<string, { totalStudents: number; lowest: number; highest: number; average: number }> {
  const stats: Record<string, { totalStudents: number; lowest: number; highest: number; average: number }> = {}

  allSubjects.forEach((subject) => {
    const subjectAssessments = classAssessments.filter(
      (assessment) => assessment.subjectId === subject.id && !assessment.isAbsent && !assessment.isExempt,
    )

    if (subjectAssessments.length > 0) {
      const scores = subjectAssessments.map(
        (assessment) => (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0),
      )

      stats[subject.id] = {
        totalStudents: subjectAssessments.length,
        lowest: Math.min(...scores),
        highest: Math.max(...scores),
        average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      }
    } else {
      stats[subject.id] = {
        totalStudents: 0,
        lowest: 0,
        highest: 0,
        average: 0,
      }
    }
  })

  return stats
}

// Calculate subject-specific positions
function calculateSubjectPositions(
  classAssessments: any[],
  studentId: string,
  allSubjects: any[],
): Record<string, number | null> {
  const positions: Record<string, number | null> = {}

  allSubjects.forEach((subject) => {
    const subjectAssessments = classAssessments.filter(
      (assessment) => assessment.subjectId === subject.id && !assessment.isAbsent && !assessment.isExempt,
    )

    if (subjectAssessments.length > 0) {
      // Calculate scores and sort by descending order
      const studentScores = subjectAssessments.map((assessment) => ({
        studentId: assessment.student.id,
        score: (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0),
      }))

      studentScores.sort((a, b) => b.score - a.score)

      // Find position
      let currentPosition = 1
      let previousScore = -1
      let studentsAtSameRank = 0

      for (let i = 0; i < studentScores.length; i++) {
        const studentScore = studentScores[i]

        if (studentScore.score !== previousScore) {
          currentPosition = i + 1
          studentsAtSameRank = 1
        } else {
          studentsAtSameRank++
        }

        if (studentScore.studentId === studentId) {
          positions[subject.id] = currentPosition
          break
        }

        previousScore = studentScore.score
      }

      if (positions[subject.id] === undefined) {
        positions[subject.id] = null
      }
    } else {
      positions[subject.id] = null
    }
  })

  return positions
}

// Calculate student's position in class
async function calculateStudentPosition(studentId: string, termId: string): Promise<number> {
  try {
    // Get the student's class term for this term
    const studentClassTerm = await prisma.studentClassTerm.findFirst({
      where: {
        student: { id: studentId },
        classTerm: {
          termId,
        },
      },
      include: {
        classTerm: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!studentClassTerm) {
      return 0
    }

    // Get all students in the same class term with their average scores
    const classStudents = await prisma.studentClassTerm.findMany({
      where: {
        classTermId: studentClassTerm.classTerm.id,
      },
      include: {
        assessments: {
          where: {
            termId,
          },
        },
      },
    })

    // Calculate average scores for each student
    const studentAverages = classStudents.map((sct) => {
      let totalScore = 0
      let subjectCount = 0

      sct.assessments.forEach((assessment) => {
        if (!assessment.isAbsent && !assessment.isExempt) {
          const subjectTotal =
            (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0)
          totalScore += subjectTotal
          subjectCount++
        }
      })

      return {
        studentId: sct.studentId,
        averageScore: subjectCount > 0 ? totalScore / subjectCount : 0,
      }
    })

    // Sort by average score (descending)
    studentAverages.sort((a, b) => b.averageScore - a.averageScore)

    // Find the student's position
    const studentIndex = studentAverages.findIndex((s) => s.studentId === studentId)
    return studentIndex >= 0 ? studentIndex + 1 : 0
  } catch (error) {
    console.error("Error calculating student position:", error)
    return 0
  }
}

// Get class statistics for report generation
export async function getClassStatistics(classTermId: string) {
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
        classSubjects: {
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
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    // Get all assessments for this class term
    const assessments = await prisma.assessment.findMany({
      where: {
        termId: classTerm.term.id,
        studentClassTerm: {
          classTermId,
        },
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
    })

    // Initialize statistics for all subjects in the class
    const subjectStats: Record<string, { scores: number[]; total: number; count: number }> = {}

    // Initialize with all class subjects
    classTerm.classSubjects.forEach((cs) => {
      subjectStats[cs.subject.id] = { scores: [], total: 0, count: 0 }
    })

    const allTotalScores: number[] = []

    // Process assessments
    assessments.forEach((assessment) => {
      if (!assessment.isAbsent && !assessment.isExempt) {
        const subjectTotal =
          (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0)

        if (subjectStats[assessment.subjectId]) {
          subjectStats[assessment.subjectId].scores.push(subjectTotal)
          subjectStats[assessment.subjectId].total += subjectTotal
          subjectStats[assessment.subjectId].count++
        }
      }
    })

    // Calculate subject statistics
    const subjectHighest: Record<string, number> = {}
    const subjectLowest: Record<string, number> = {}
    const subjectAverage: Record<string, number> = {}

    Object.entries(subjectStats).forEach(([subjectId, stats]) => {
      if (stats.scores.length > 0) {
        subjectHighest[subjectId] = Math.max(...stats.scores)
        subjectLowest[subjectId] = Math.min(...stats.scores)
        subjectAverage[subjectId] = stats.total / stats.count
        allTotalScores.push(...stats.scores)
      } else {
        // No scores for this subject
        subjectHighest[subjectId] = 0
        subjectLowest[subjectId] = 0
        subjectAverage[subjectId] = 0
      }
    })

    // Calculate overall class statistics
    const highestTotal = allTotalScores.length > 0 ? Math.max(...allTotalScores) : 0
    const lowestTotal = allTotalScores.length > 0 ? Math.min(...allTotalScores) : 0
    const classAverage =
      allTotalScores.length > 0 ? allTotalScores.reduce((a, b) => a + b, 0) / allTotalScores.length : 0

    const classStatistics = {
      highestTotal,
      lowestTotal,
      classAverage,
      subjectHighest,
      subjectLowest,
      subjectAverage,
    }

    return { success: true, data: classStatistics }
  } catch (error) {
    console.error("Failed to get class statistics:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}
