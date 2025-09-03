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

// Get available sessions and terms for transition
export async function getTransitionOptions() {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Get all sessions for the school
    const sessions = await prisma.session.findMany({
      where: {
        schoolId,
      },
      include: {
        terms: {
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            name: true,
            isCurrent: true,
            session: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { startDate: "desc" },
    })

    // Get current session and term
    const currentTerm = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        session: {
          schoolId,
        },
      },
      include: {
        session: true,
      },
    })

    console.log("Sessions found:", sessions.length)
    console.log("Current term:", currentTerm?.name)

    return {
      success: true,
      data: {
        sessions,
        currentTerm,
      },
    }
  } catch (error) {
    console.error("Failed to get transition options:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get classes available for transition
export async function getTransitionClasses(fromTermId: string, toTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    console.log("Getting classes for terms:", { fromTermId, toTermId, schoolId })

    // First, let's check if the terms exist
    const [fromTerm, toTerm] = await Promise.all([
      prisma.term.findUnique({
        where: { id: fromTermId },
        include: { session: true },
      }),
      prisma.term.findUnique({
        where: { id: toTermId },
        include: { session: true },
      }),
    ])

    console.log("From term:", fromTerm?.name, "To term:", toTerm?.name)

    if (!fromTerm || !toTerm) {
      throw new Error("One or both terms not found")
    }

    // Get source term classes
    const sourceClasses = await prisma.classTerm.findMany({
      where: {
        termId: fromTermId,
        class: {
          schoolId,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
      orderBy: {
        class: {
          name: "asc",
        },
      },
    })

    console.log("Source classes found:", sourceClasses.length)

    // Get destination term classes
    const destinationClasses = await prisma.classTerm.findMany({
      where: {
        termId: toTermId,
        class: {
          schoolId,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
      orderBy: {
        class: {
          name: "asc",
        },
      },
    })

    console.log("Destination classes found:", destinationClasses.length)

    // If no source classes found, let's check if there are any classes for this school
    if (sourceClasses.length === 0) {
      const allClasses = await prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, level: true },
      })
      console.log("Total classes in school:", allClasses.length)

      const allClassTerms = await prisma.classTerm.findMany({
        where: {
          class: { schoolId },
        },
        include: {
          class: { select: { name: true } },
          term: { select: { name: true } },
        },
      })
      console.log("Total class terms:", allClassTerms.length)
    }

    return {
      success: true,
      data: {
        sourceClasses: sourceClasses || [],
        destinationClasses: destinationClasses || [],
      },
    }
  } catch (error) {
    console.error("Failed to get transition classes:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get students eligible for transition with their performance data
export async function getStudentsForTransition(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Verify access to the class term
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
            name: true,
            level: true,
          },
        },
        term: {
          select: {
            id: true,
            name: true,
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

    // Get grading system
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

    // Get all students in the class with their assessments
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

    // Calculate performance for each student
    const studentsWithPerformance = studentClassTerms.map((sct) => {
      const student = sct.student
      const assessments = sct.assessments

      // Calculate overall performance
      let totalScore = 0
      let subjectCount = 0
      let passedSubjects = 0
      let failedSubjects = 0
      const subjectGrades: string[] = []

      assessments.forEach((assessment) => {
        if (!assessment.isAbsent && !assessment.isExempt) {
          const subjectTotal =
            (assessment.ca1 || 0) + (assessment.ca2 || 0) + (assessment.ca3 || 0) + (assessment.exam || 0)

          const gradeResult = calculateGrade(subjectTotal, gradingSystem)
          subjectGrades.push(gradeResult.grade)

          if (subjectTotal >= gradingSystem.passMark) {
            passedSubjects++
          } else {
            failedSubjects++
          }

          totalScore += subjectTotal
          subjectCount++
        }
      })

      const averageScore = subjectCount > 0 ? totalScore / subjectCount : 0
      const overallGradeResult = calculateGrade(averageScore, gradingSystem)

      // Determine transition eligibility
      const passRate = subjectCount > 0 ? (passedSubjects / subjectCount) * 100 : 0
      const isEligible = determineTransitionEligibility(averageScore, passRate, failedSubjects, gradingSystem.passMark)

      return {
        studentId: student.id,
        studentClassTermId: sct.id,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        admissionNo: student.admissionNo,
        gender: student.user.gender || "OTHER",
  // totalScore is computed at runtime; do not persist
        averageScore,
        grade: overallGradeResult.grade,
        remark: overallGradeResult.remark,
        subjectsOffered: subjectCount,
        subjectsPassed: passedSubjects,
        subjectsFailed: failedSubjects,
        passRate,
        isEligible,
        eligibilityReason: getEligibilityReason(averageScore, passRate, failedSubjects, gradingSystem.passMark),
        subjectGrades,
        position: 0, // Will be set below
      }
    })

    // Sort by average score (descending)
    studentsWithPerformance.sort((a, b) => b.averageScore - a.averageScore)

    // Assign positions
    let currentPosition = 1
    let previousScore = -1
    studentsWithPerformance.forEach((student, index) => {
      if (student.averageScore !== previousScore) {
        currentPosition = index + 1
      }
      student.position = currentPosition
      previousScore = student.averageScore
    })

    return {
      success: true,
      data: {
        classInfo: {
          className: classTerm.class.name,
          classLevel: classTerm.class.level,
          termName: classTerm.term.name,
        },
        students: studentsWithPerformance,
        gradingSystem,
        statistics: {
          totalStudents: studentsWithPerformance.length,
          eligibleStudents: studentsWithPerformance.filter((s) => s.isEligible).length,
          ineligibleStudents: studentsWithPerformance.filter((s) => !s.isEligible).length,
          averageClassScore:
            studentsWithPerformance.length > 0
              ? studentsWithPerformance.reduce((sum, s) => sum + s.averageScore, 0) / studentsWithPerformance.length
              : 0,
        },
      },
    }
  } catch (error) {
    console.error("Failed to get students for transition:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Determine if a student is eligible for transition
function determineTransitionEligibility(
  averageScore: number,
  passRate: number,
  failedSubjects: number,
  passMark: number,
): boolean {
  // Multiple criteria for transition eligibility
  if (averageScore >= passMark && passRate >= 50) {
    return true // Strong performance
  }
  if (averageScore >= passMark * 0.8 && failedSubjects <= 2) {
    return true // Acceptable performance with few failures
  }
  if (passRate >= 70) {
    return true // High pass rate even if average is slightly low
  }
  return false // Not eligible
}

// Get reason for eligibility/ineligibility
function getEligibilityReason(
  averageScore: number,
  passRate: number,
  failedSubjects: number,
  passMark: number,
): string {
  if (averageScore >= passMark && passRate >= 50) {
    return "Excellent performance - meets all criteria"
  }
  if (averageScore >= passMark * 0.8 && failedSubjects <= 2) {
    return "Good performance - acceptable with few failures"
  }
  if (passRate >= 70) {
    return "High pass rate - eligible despite lower average"
  }
  if (averageScore < passMark * 0.6) {
    return "Below minimum average score requirement"
  }
  if (failedSubjects > 3) {
    return "Too many failed subjects"
  }
  if (passRate < 40) {
    return "Low pass rate - needs improvement"
  }
  return "Does not meet transition criteria"
}

// Execute student transitions
export async function executeStudentTransitions(transitions: {
  fromClassTermId: string
  toClassTermId: string
  studentIds: string[]
  transitionType: "PROMOTION" | "TRANSFER" | "WITHDRAWAL"
  notes?: string
}) {
  try {
    const schoolId = await authorizeAndGetSchoolId()
    const { fromClassTermId, toClassTermId, studentIds, transitionType, notes } = transitions

    // Verify access to both class terms
    const [fromClassTerm, toClassTerm] = await Promise.all([
      prisma.classTerm.findUnique({
        where: { id: fromClassTermId },
        include: {
          class: { select: { schoolId: true, name: true, level: true } },
          term: { select: { name: true, session: { select: { name: true } } } },
        },
      }),
      prisma.classTerm.findUnique({
        where: { id: toClassTermId },
        include: {
          class: { select: { schoolId: true, name: true, level: true } },
          term: { select: { name: true, session: { select: { name: true } } } },
        },
      }),
    ])

    if (!fromClassTerm || !toClassTerm) {
      throw new Error("Source or destination class term not found")
    }

    if (schoolId && (fromClassTerm.class.schoolId !== schoolId || toClassTerm.class.schoolId !== schoolId)) {
      throw new Error("Classes do not belong to admin's school")
    }

    // Get current user for audit trail
    const session = await auth()
    const userId = session?.user?.id

    if (!userId) {
      throw new Error("User ID not found")
    }

    // Execute transitions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const transitionRecords = []

      for (const studentId of studentIds) {
        // Get the student's current class term record
        const currentStudentClassTerm = await tx.studentClassTerm.findFirst({
          where: {
            studentId,
            classTermId: fromClassTermId,
          },
        })

        if (!currentStudentClassTerm) {
          throw new Error(`Student ${studentId} not found in source class`)
        }

        // Check if student already exists in destination class term
        const existingRecord = await tx.studentClassTerm.findFirst({
          where: {
            studentId,
            classTermId: toClassTermId,
          },
        })

        if (existingRecord) {
          throw new Error(`Student ${studentId} already exists in destination class`)
        }

        // Create new student class term record
        const newStudentClassTerm = await tx.studentClassTerm.create({
          data: {
            studentId,
            classTermId: toClassTermId,
          },
        })

        // Create transition record for audit trail
        const transitionRecord = await tx.studentTransition.create({
          data: {
            studentId,
            fromClassTermId,
            toClassTermId,
            transitionType,
            transitionDate: new Date(),
            notes: notes || "",
            createdBy: userId,
          },
        })

        transitionRecords.push({
          studentId,
          transitionId: transitionRecord.id,
          newStudentClassTermId: newStudentClassTerm.id,
        })
      }

      return transitionRecords
    })

    return {
      success: true,
      data: {
        transitionsCreated: result.length,
        transitions: result,
        message: `Successfully transitioned ${result.length} student${result.length > 1 ? "s" : ""} from ${fromClassTerm.class.name} to ${toClassTerm.class.name}`,
      },
    }
  } catch (error) {
    console.error("Failed to execute student transitions:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get transition history
export async function getTransitionHistory(studentId?: string, classTermId?: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    const whereClause: any = {}

    if (studentId) {
      whereClause.studentId = studentId
    }

    if (classTermId) {
      whereClause.OR = [{ fromClassTermId: classTermId }, { toClassTermId: classTermId }]
    }

    // Add school filter
    if (schoolId) {
      whereClause.student = {
        schoolId,
      }
    }

    const transitions = await prisma.studentTransition.findMany({
      where: whereClause,
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        fromClassTerm: {
          include: {
            class: { select: { name: true, level: true } },
            term: {
              select: {
                name: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        toClassTerm: {
          include: {
            class: { select: { name: true, level: true } },
            term: {
              select: {
                name: true,
                session: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { transitionDate: "desc" },
      take: 100,
    })

    const formattedTransitions = transitions.map((transition) => ({
      id: transition.id,
      studentName: `${transition.student.user.firstName} ${transition.student.user.lastName}`,
      admissionNo: transition.student.admissionNo,
      fromClass: transition.fromClassTerm.class.name,
      fromTerm: `${transition.fromClassTerm.term.session.name} - ${transition.fromClassTerm.term.name}`,
      toClass: transition.toClassTerm.class.name,
      toTerm: `${transition.toClassTerm.term.session.name} - ${transition.toClassTerm.term.name}`,
      transitionType: transition.transitionType,
      transitionDate: transition.transitionDate,
      notes: transition.notes,
      createdBy: transition.createdBy,
    }))

    return {
      success: true,
      data: formattedTransitions,
    }
  } catch (error) {
    console.error("Failed to get transition history:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get transition statistics
export async function getTransitionStatistics(termId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    const stats = await prisma.studentTransition.groupBy({
      by: ["transitionType"],
      where: {
        toClassTerm: {
          termId,
        },
        student: {
          schoolId,
        },
      },
      _count: {
        id: true,
      },
    })

    const totalTransitions = stats.reduce((sum, stat) => sum + stat._count.id, 0)

    return {
      success: true,
      data: {
        totalTransitions,
        byType: stats.reduce(
          (acc, stat) => {
            acc[stat.transitionType] = stat._count.id
            return acc
          },
          {} as Record<string, number>,
        ),
      },
    }
  } catch (error) {
    console.error("Failed to get transition statistics:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}
