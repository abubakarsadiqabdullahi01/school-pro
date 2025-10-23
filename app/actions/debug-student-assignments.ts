"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/auth"

export async function debugStudentAssignments() {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    // Get all duplicate assignments (students in multiple classes in same term)
    const duplicateAssignments = await prisma.$queryRaw`
      SELECT 
        s.id as "studentId",
        s."admissionNo",
        u."firstName",
        u."lastName",
        COUNT(DISTINCT sct."classTermId") as "classCount",
        t.id as "termId",
        t.name as "termName",
        STRING_AGG(DISTINCT c.name, ', ') as "classNames",
        STRING_AGG(DISTINCT sct.id::text, ', ') as "studentClassTermIds"
      FROM "Student" s
      JOIN "User" u ON s."userId" = u.id
      JOIN "StudentClassTerm" sct ON s.id = sct."studentId"
      JOIN "ClassTerm" ct ON sct."classTermId" = ct.id
      JOIN "Class" c ON ct."classId" = c.id
      JOIN "Term" t ON ct."termId" = t.id
      JOIN "Session" sess ON t."sessionId" = sess.id
      GROUP BY s.id, s."admissionNo", u."firstName", u."lastName", t.id, t.name, sess.id
      HAVING COUNT(DISTINCT sct."classTermId") > 1
      ORDER BY "classCount" DESC, u."lastName", u."firstName"
    `

    // Get current term assignments overview
    const currentTermOverview = await prisma.$queryRaw`
      SELECT 
        t.name as "termName",
        sess.name as "sessionName",
        COUNT(DISTINCT s.id) as "totalStudents",
        COUNT(DISTINCT sct.id) as "totalAssignments",
        COUNT(DISTINCT CASE WHEN assignment_count > 1 THEN s.id END) as "studentsWithMultipleClasses"
      FROM "Term" t
      JOIN "Session" sess ON t."sessionId" = sess.id
      LEFT JOIN "ClassTerm" ct ON t.id = ct."termId"
      LEFT JOIN "StudentClassTerm" sct ON ct.id = sct."classTermId"
      LEFT JOIN "Student" s ON sct."studentId" = s.id
      LEFT JOIN (
        SELECT 
          sct2."studentId",
          ct2."termId",
          COUNT(DISTINCT sct2."classTermId") as assignment_count
        FROM "StudentClassTerm" sct2
        JOIN "ClassTerm" ct2 ON sct2."classTermId" = ct2.id
        GROUP BY sct2."studentId", ct2."termId"
      ) assignment_counts ON s.id = assignment_counts."studentId" AND t.id = assignment_counts."termId"
      WHERE t."isCurrent" = true OR sess."isCurrent" = true
      GROUP BY t.id, t.name, sess.id, sess.name
      ORDER BY t."startDate" DESC
    `

    // Get detailed assignment history for problematic students
    const problematicStudents = await prisma.student.findMany({
      where: {
        classTerms: {
          some: {} // Students with at least one assignment
        }
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        classTerms: {
          include: {
            classTerm: {
              include: {
                class: true,
                term: {
                  include: {
                    session: true
                  }
                }
              }
            }
          },
          orderBy: {
            classTerm: {
              term: {
                startDate: 'desc'
              }
            }
          }
        }
      },
      orderBy: {
        admissionNo: 'asc'
      },
      take: 50 // Limit to first 50 for performance
    })

    // Analyze assignment patterns
    const assignmentAnalysis = problematicStudents.map(student => {
      const termAssignments: Record<string, any> = {}
      
      student.classTerms.forEach(sct => {
        const termKey = `${sct.classTerm.term.session.name} - ${sct.classTerm.term.name}`
        
        if (!termAssignments[termKey]) {
          termAssignments[termKey] = {
            termId: sct.classTerm.term.id,
            className: sct.classTerm.class.name,
            classId: sct.classTerm.class.id,
            studentClassTermId: sct.id,
            assignmentDate: sct.createdAt
          }
        } else {
          // This term already has an assignment - potential duplicate!
          if (!termAssignments[termKey].duplicates) {
            termAssignments[termKey].duplicates = []
          }
          termAssignments[termKey].duplicates.push({
            className: sct.classTerm.class.name,
            classId: sct.classTerm.class.id,
            studentClassTermId: sct.id,
            assignmentDate: sct.createdAt
          })
        }
      })

      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        termAssignments,
        hasDuplicates: Object.values(termAssignments).some((assignment: any) => assignment.duplicates)
      }
    })

    // Get recent student creation logs
    const recentStudents = await prisma.student.findMany({
      take: 20,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        classTerms: {
          include: {
            classTerm: {
              include: {
                class: true,
                term: true
              }
            }
          }
        },
        _count: {
          select: {
            classTerms: true
          }
        }
      }
    })

    return {
      success: true,
      data: {
        duplicateAssignments,
        currentTermOverview,
        assignmentAnalysis: assignmentAnalysis.filter(s => s.hasDuplicates),
        recentStudents: recentStudents.map(s => ({
          id: s.id,
          admissionNo: s.admissionNo,
          name: `${s.user.firstName} ${s.user.lastName}`,
          createdAt: s.createdAt,
          classTermCount: s._count.classTerms,
          assignments: s.classTerms.map(ct => ({
            className: ct.classTerm.class.name,
            termName: ct.classTerm.term.name,
            assignedAt: ct.createdAt
          }))
        })),
        summary: {
          totalStudentsWithDuplicates: Array.isArray(duplicateAssignments) ? duplicateAssignments.length : 0,
          totalProblematicStudents: assignmentAnalysis.filter(s => s.hasDuplicates).length,
          recentStudentsAnalyzed: recentStudents.length
        }
      }
    }

  } catch (error) {
    console.error("Debug student assignments error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during debug"
    }
  }
}

export async function fixDuplicateAssignments(studentId: string, termId: string) {
    try {
        const session = await auth()
        if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized - Only super admin can fix duplicates" }
    }

    // Get all assignments for this student in the specified term
    const assignments = await prisma.studentClassTerm.findMany({
      where: {
        studentId: studentId,
        classTerm: {
          termId: termId
        }
      },
      include: {
        classTerm: {
          include: {
            class: true,
            term: true
          }
        },
        assessments: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    if (assignments.length <= 1) {
      return { 
        success: true, 
        message: "No duplicates found for this student in the specified term",
        data: { assignments }
      }
    }

    // Keep the earliest assignment, remove others
    const [keepAssignment, ...removeAssignments] = assignments

    let fixedCount = 0
    let errorCount = 0

    for (const assignment of removeAssignments) {
      try {
        // Check if this assignment has assessments
        if (assignment.assessments.length > 0) {
          console.warn(`Cannot remove assignment ${assignment.id} - it has ${assignment.assessments.length} assessments`)
          errorCount++
          continue
        }

        await prisma.studentClassTerm.delete({
          where: { id: assignment.id }
        })
        fixedCount++

      } catch (error) {
        console.error(`Error removing assignment ${assignment.id}:`, error)
        errorCount++
      }
    }

    return {
      success: true,
      data: {
        keptAssignment: {
          id: keepAssignment.id,
          className: keepAssignment.classTerm.class.name,
          assignedAt: keepAssignment.createdAt
        },
        removedCount: fixedCount,
        errorCount: errorCount,
        totalAssignments: assignments.length
      }
    }

  } catch (error) {
    console.error("Fix duplicate assignments error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during fix"
    }
  }
}

export async function getStudentAssignmentHistory(studentId: string) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          }
        },
        classTerms: {
          include: {
            classTerm: {
              include: {
                class: true,
                term: {
                  include: {
                    session: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!student) {
      return { success: false, error: "Student not found" }
    }

    // Group assignments by term to identify duplicates
    const assignmentsByTerm: Record<string, any> = {}
    
    student.classTerms.forEach(sct => {
      const termKey = `${sct.classTerm.term.session.name}-${sct.classTerm.term.name}`
      
      if (!assignmentsByTerm[termKey]) {
        assignmentsByTerm[termKey] = {
          termId: sct.classTerm.term.id,
          termName: sct.classTerm.term.name,
          sessionName: sct.classTerm.term.session.name,
          assignments: []
        }
      }
      
      assignmentsByTerm[termKey].assignments.push({
        studentClassTermId: sct.id,
        className: sct.classTerm.class.name,
        classId: sct.classTerm.class.id,
        assignedAt: sct.createdAt,
        classTermId: sct.classTermId
      })
    })

    // Identify terms with multiple assignments
    const termsWithDuplicates = Object.entries(assignmentsByTerm)
      .filter(([_, termData]) => termData.assignments.length > 1)
      .map(([termKey, termData]) => ({
        termKey,
        ...termData
      }))

    return {
      success: true,
      data: {
        student: {
          id: student.id,
          admissionNo: student.admissionNo,
          name: `${student.user.firstName} ${student.user.lastName}`
        },
        assignmentsByTerm,
        termsWithDuplicates,
        totalAssignments: student.classTerms.length,
        totalTermsWithDuplicates: termsWithDuplicates.length
      }
    }

  } catch (error) {
    console.error("Get student assignment history error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

export async function removeAllStudentAssignmentsForTerm(termId: string) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { 
        success: false, 
        error: "Unauthorized - Only super admin can remove all assignments" 
      }
    }

    // Verify the term exists
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: {
        session: true
      }
    })

    if (!term) {
      return { success: false, error: "Term not found" }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Get all student assignments for this term
      const assignments = await tx.studentClassTerm.findMany({
        where: {
          classTerm: {
            termId: termId
          }
        },
        include: {
          assessments: {
            include: {
              subject: true
            }
          },
          student: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          classTerm: {
            include: {
              class: true
            }
          }
        }
      })

      if (assignments.length === 0) {
        return {
          totalAssignments: 0,
          assignmentsWithAssessments: 0,
          totalAssessments: 0,
          deletedAssignments: 0,
          message: "No student assignments found for this term"
        }
      }

      // Step 2: Count assessments that will be affected
      const assignmentsWithAssessments = assignments.filter(a => a.assessments.length > 0)
      const totalAssessments = assignments.reduce((sum, a) => sum + a.assessments.length, 0)

      // Step 3: Delete all assessments first (due to foreign key constraints)
      if (totalAssessments > 0) {
        await tx.assessment.deleteMany({
          where: {
            studentClassTermId: {
              in: assignments.map(a => a.id)
            }
          }
        })
      }

      // Step 4: Delete all student assignments for this term
      const deletedAssignments = await tx.studentClassTerm.deleteMany({
        where: {
          classTerm: {
            termId: termId
          }
        }
      })

      return {
        totalAssignments: assignments.length,
        assignmentsWithAssessments: assignmentsWithAssessments.length,
        totalAssessments,
        deletedAssignments: deletedAssignments.count,
        termName: term.name,
        sessionName: term.session.name,
        affectedStudents: Array.from(new Set(assignments.map(a => a.student.id))).length
      }
    }, {
      timeout: 60000 // Longer timeout for large operations
    })

    return {
      success: true,
      data: result,
      message: `Successfully removed all student assignments for ${result.termName} term`
    }

  } catch (error) {
    console.error("Error removing all student assignments:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during removal"
    }
  }
}

export async function getTermAssignmentsSummary(termId: string) {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" }
    }

    const summary = await prisma.$queryRaw`
      SELECT 
        t.name as "termName",
        sess.name as "sessionName",
        COUNT(DISTINCT sct.id) as "totalAssignments",
        COUNT(DISTINCT s.id) as "totalStudents",
        COUNT(DISTINCT c.id) as "totalClasses",
        COUNT(a.id) as "totalAssessments",
        COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN sct.id END) as "assignmentsWithAssessments"
      FROM "Term" t
      JOIN "Session" sess ON t."sessionId" = sess.id
      LEFT JOIN "ClassTerm" ct ON t.id = ct."termId"
      LEFT JOIN "StudentClassTerm" sct ON ct.id = sct."classTermId"
      LEFT JOIN "Student" s ON sct."studentId" = s.id
      LEFT JOIN "Class" c ON ct."classId" = c.id
      LEFT JOIN "Assessment" a ON sct.id = a."studentClassTermId"
      WHERE t.id = ${termId}
      GROUP BY t.id, t.name, sess.id, sess.name
    `

    const classBreakdown = await prisma.$queryRaw`
      SELECT 
        c.name as "className",
        c.level as "classLevel",
        COUNT(DISTINCT sct.id) as "studentCount",
        COUNT(a.id) as "assessmentCount"
      FROM "ClassTerm" ct
      JOIN "Class" c ON ct."classId" = c.id
      LEFT JOIN "StudentClassTerm" sct ON ct.id = sct."classTermId"
      LEFT JOIN "Assessment" a ON sct.id = a."studentClassTermId"
      WHERE ct."termId" = ${termId}
      GROUP BY c.id, c.name, c.level
      ORDER BY c.level, c.name
    `

    return {
      success: true,
      data: {
        summary: summary[0] || {},
        classBreakdown,
        hasData: (summary[0]?.totalAssignments || 0) > 0
      }
    }

  } catch (error) {
    console.error("Error getting term assignments summary:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}